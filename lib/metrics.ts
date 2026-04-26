// ═══════════════════════════════════════════════════════════════
//  Prometheus-format metrics registry
//
//  Small, dependency-free Prometheus exposition implementation. The
//  full prom-client package is overkill for the handful of counters
//  and gauges we care about and adds a noticeable install-time cost.
//
//  Usage:
//
//      const counter = registerCounter(
//          'icontale_socket_events_total',
//          'Accepted socket events by event name',
//          ['event']
//      );
//      counter.inc({ event: 'submit-story' });
//
//      const gauge = registerGauge('icontale_lobbies', 'Active lobbies');
//      gauge.set(42);
//
//      const text = await renderMetrics();
//      res.type('text/plain; version=0.0.4').send(text);
//
//  Metric names follow the [Prometheus naming conventions]
//  (https://prometheus.io/docs/practices/naming/): snake_case with
//  an 'icontale_' prefix so multi-tenant scraping dashboards stay
//  tidy. Label cardinality is deliberately low; never push untrusted
//  strings (e.g. raw usernames) as label values.
// ═══════════════════════════════════════════════════════════════

type LabelMap = Record<string, string>;

interface MetricBase {
    name: string;
    help: string;
    type: 'counter' | 'gauge';
    labelNames: string[];
    values: Map<string, { labels: LabelMap; value: number }>;
}

const metrics = new Map<string, MetricBase>();

const snapshotProviders = new Map<string, () => number | Promise<number>>();

function labelKey(labels: LabelMap, labelNames: string[]): string {
    return labelNames.map((name) => `${name}=${labels[name] ?? ''}`).join('|');
}

function escapeLabel(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function formatSample(metric: MetricBase): string {
    const lines: string[] = [];
    lines.push(`# HELP ${metric.name} ${metric.help}`);
    lines.push(`# TYPE ${metric.name} ${metric.type}`);

    if (metric.values.size === 0 && metric.labelNames.length === 0) {
        lines.push(`${metric.name} 0`);
        return lines.join('\n');
    }

    for (const { labels, value } of metric.values.values()) {
        const labelStr = metric.labelNames.length
            ? `{${metric.labelNames
                  .map((n) => `${n}="${escapeLabel(labels[n] ?? '')}"`)
                  .join(',')}}`
            : '';
        lines.push(`${metric.name}${labelStr} ${value}`);
    }
    return lines.join('\n');
}

export interface Counter {
    inc(_labels?: LabelMap, _amount?: number): void;
}

export interface Gauge {
    set(_value: number, _labels?: LabelMap): void;
    inc(_labels?: LabelMap, _amount?: number): void;
    dec(_labels?: LabelMap, _amount?: number): void;
}

export function registerCounter(
    name: string,
    help: string,
    labelNames: string[] = []
): Counter {
    const metric: MetricBase = {
        name,
        help,
        type: 'counter',
        labelNames,
        values: new Map(),
    };
    metrics.set(name, metric);

    return {
        inc(labels = {}, amount = 1) {
            const key = labelKey(labels, labelNames);
            const existing = metric.values.get(key);
            if (existing) existing.value += amount;
            else metric.values.set(key, { labels: { ...labels }, value: amount });
        },
    };
}

export function registerGauge(
    name: string,
    help: string,
    labelNames: string[] = []
): Gauge {
    const metric: MetricBase = {
        name,
        help,
        type: 'gauge',
        labelNames,
        values: new Map(),
    };
    metrics.set(name, metric);

    function update(delta: number, labels: LabelMap, replace = false) {
        const key = labelKey(labels, labelNames);
        if (replace) {
            metric.values.set(key, { labels: { ...labels }, value: delta });
            return;
        }
        const existing = metric.values.get(key);
        if (existing) existing.value += delta;
        else metric.values.set(key, { labels: { ...labels }, value: delta });
    }

    return {
        set(value, labels = {}) { update(value, labels, true); },
        inc(labels = {}, amount = 1) { update(amount, labels); },
        dec(labels = {}, amount = 1) { update(-amount, labels); },
    };
}

/**
 * Register a gauge whose value is computed lazily on /metrics scrape.
 * Useful when the source of truth lives elsewhere (e.g. Redis) and
 * we don't want to mirror it in-memory.
 */
export function registerSnapshotGauge(
    name: string,
    help: string,
    provider: () => number | Promise<number>
): void {
    const metric: MetricBase = {
        name,
        help,
        type: 'gauge',
        labelNames: [],
        values: new Map(),
    };
    metrics.set(name, metric);
    snapshotProviders.set(name, provider);
}

/** Render every registered metric in Prometheus exposition format. */
export async function renderMetrics(): Promise<string> {
    for (const [name, provider] of snapshotProviders) {
        try {
            const value = await provider();
            const metric = metrics.get(name);
            if (metric) {
                metric.values.set('', { labels: {}, value });
            }
        } catch {
            // Swallow — a broken provider shouldn't nuke the whole scrape.
        }
    }

    const chunks: string[] = [];
    for (const metric of metrics.values()) {
        chunks.push(formatSample(metric));
    }
    return chunks.join('\n\n') + '\n';
}

/** Wipe everything. Only used in tests. */
export function __reset(): void {
    metrics.clear();
    snapshotProviders.clear();
}
