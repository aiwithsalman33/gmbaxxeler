-- Jobs published through the mock adapter never reached Google.
ALTER TABLE "scheduled_jobs" ADD COLUMN "simulated" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "worker_status" (
    "id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "last_beat_at" TIMESTAMP(3) NOT NULL,
    "hostname" TEXT,
    "adapter" TEXT,
    CONSTRAINT "worker_status_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "worker_job_runs" (
    "name" TEXT NOT NULL,
    "last_started_at" TIMESTAMP(3),
    "last_finished_at" TIMESTAMP(3),
    "last_duration_ms" INTEGER,
    "last_error" TEXT,
    "last_result" JSONB,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "worker_job_runs_pkey" PRIMARY KEY ("name")
);
