package mirror

import "github.com/prometheus/client_golang/prometheus"

// Metrics are the mirror's Prometheus metrics.
type Metrics struct {
	repos       *prometheus.GaugeVec
	lastSuccess *prometheus.GaugeVec
	size        *prometheus.GaugeVec
	failures    *prometheus.CounterVec
	runs        *prometheus.CounterVec
	duration    prometheus.Histogram
	lastRun     prometheus.Gauge
}

// NewMetrics creates the metrics and registers them with reg, if it's not
// nil.
func NewMetrics(reg prometheus.Registerer) *Metrics {
	m := &Metrics{
		repos: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "cyberlab_mirror_repositories",
			Help: "Repositories by sync state.",
		}, []string{"state"}),
		lastSuccess: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "cyberlab_mirror_repository_last_success_timestamp_seconds",
			Help: "When each repository last synced successfully.",
		}, []string{"repository"}),
		size: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "cyberlab_mirror_repository_size_bytes",
			Help: "Size of each repository's copy on disk.",
		}, []string{"repository"}),
		failures: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "cyberlab_mirror_repository_sync_failures_total",
			Help: "Failed syncs, per repository.",
		}, []string{"repository"}),
		runs: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "cyberlab_mirror_sync_runs_total",
			Help: "Sync runs by result: ok, partial (some repositories failed), or list_failed (GitHub's repository list failed).",
		}, []string{"result"}),
		duration: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name:    "cyberlab_mirror_sync_duration_seconds",
			Help:    "How long a sync run of every repository took.",
			Buckets: []float64{5, 15, 30, 60, 120, 300, 600, 1800},
		}),
		lastRun: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "cyberlab_mirror_last_sync_run_timestamp_seconds",
			Help: "When the last sync run finished, whatever its result, except when listing repositories failed.",
		}),
	}
	if reg != nil {
		reg.MustRegister(m.repos, m.lastSuccess, m.size, m.failures, m.runs, m.duration, m.lastRun)
	}
	return m
}

// forget drops a repository's series once it's no longer tracked.
func (m *Metrics) forget(name string) {
	m.lastSuccess.DeleteLabelValues(name)
	m.size.DeleteLabelValues(name)
	m.failures.DeleteLabelValues(name)
}
