# Observability Naming Conventions

This file defines the naming conventions for all telemetry emitted by this project. Every span, metric, event, and attribute name used in BDD scenarios and implementation MUST follow these rules.

---

## Reference

Follows [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/general/naming/) naming rules.

---

## Service

- **Service name**: [e.g., orderflow, paymentservice]
- **Namespace prefix**: [e.g., orderflow.]

---

## Naming Rules

- **Lowercase, dot-separated namespaces**: `orderflow.order.submit`
- **Snake_case within dots** for multi-word components: `http.response.status_code`
- **Don't use underscores for namespace separation** — use dots. Underscore only when dot doesn't make semantic sense: `rate_limiting` not `rate.limiting`
- **Don't pluralize metric namespaces**: `system.process.count` not `system.processes`
- **Be precise**: `order.id` not `id`, `payment.method` not `method`
- **Shorter is better** when it doesn't compromise clarity

---

## Spans

**Pattern**: `{namespace}.{operation}`

| Span Name | When to Use |
|-----------|-------------|
| `orderflow.order.submit` | When an order is submitted |
| `orderflow.payment.process` | When a payment is processed |
| `orderflow.user.authenticate` | When a user authenticates |

**Rules**:
- Operation name: verb in base form (submit, process, authenticate)
- One span per meaningful operation boundary
- Span name must be stable (no high-cardinality values in the name)

---

## Metrics

**Pattern**: `{namespace}.{entity}.{measurement_type}`

| Metric Name | Instrument Type | When to Use |
|-------------|----------------|-------------|
| `orderflow.order.duration` | Histogram | Time taken for an operation |
| `orderflow.order.processed.count` | Counter | Discrete event count |
| `orderflow.queue.depth` | UpDownCounter | Current depth of a queue |
| `orderflow.cache.hit.ratio` | Gauge | Instantaneous value |

**Instrument type inference rules**:
- `*.duration` → Histogram (elapsed time of discrete operations)
- `*.count` → Counter (monotonically increasing event count)
- `*.ratio` or `*.utilization` → Gauge (fraction, 0-1 range)
- `*.depth` or `*.size` → UpDownCounter (current value, can go up and down)

**Rules**:
- Duration histograms use seconds as the unit: `orderflow.order.duration`
- Counters are monotonically increasing
- Don't append `_total` to counter names

---

## Events

**Pattern**: `{namespace}.{entity}.{past_tense_verb}`

| Event Name | When to Emit |
|------------|--------------|
| `orderflow.order.processed` | After an order is successfully processed |
| `orderflow.payment.declined` | When a payment is declined |
| `orderflow.user.login_failed` | When a user login attempt fails |

**Rules**:
- Use past tense (processed, declined, created)
- One event per meaningful state change

---

## Attributes

**Pattern**: `{entity}.{property}` (dot-separated)

| Attribute Key | Value Type | Example |
|---------------|------------|---------|
| `order.id` | string | `"ord_123"` |
| `order.total` | double | `49.99` |
| `order.item_count` | int | `3` |
| `payment.method` | string | `"credit_card"` |
| `user.id` | string | `"usr_456"` |

**Rules**:
- Singular for single entity: `order.id`
- Plural for arrays: `order.item_ids`
- Dot-separated, not camelCase: `order.id` not `orderId`
- No underscores for namespace: `order.id` not `order_id`

---

## Required Attributes

### Every span MUST include:
- `service.name` (from resource)
- `service.version` (from resource)

### Every metric MUST include:
- `service.name`
- `environment` (dev / staging / prod)

---

## Resource Attributes

Configured at service startup, not per-span:

| Attribute | Value | Example |
|-----------|-------|---------|
| `service.name` | Application name | `"orderflow"` |
| `service.version` | Semantic version | `"1.2.0"` |
| `deployment.environment` | Target environment | `"development"` |

---

## Examples

### Span with attributes
```
Span: orderflow.order.submit
Attributes:
  order.id = "ord_123"
  order.total = 49.99
  order.item_count = 3
  service.name = "orderflow"
```

### Metric with labels
```
Metric: orderflow.order.duration (Histogram)
Labels:
  service.name = "orderflow"
  environment = "development"
  status = "success"
Value: 0.234 seconds
```

### Event with attributes
```
Event: orderflow.order.processed
Attributes:
  order.id = "ord_123"
  order.total = 49.99
```
