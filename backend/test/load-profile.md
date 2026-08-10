# Load profile for Go-Live validation

Run against homologation only after credentials and callback receiver exist.

Target monthly baseline: ~200,000 orders/month. The load test must include short bursts above the monthly average, duplicate/replay traffic and callback failures. Measure ingress latency, queue age, throughput, Omie error rate, callback error rate and time to fiscal confirmation. Do not run load tests against production Omie without explicit approval.
