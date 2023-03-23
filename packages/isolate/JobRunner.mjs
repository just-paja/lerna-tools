class DummySpinner {
  start() {}
  stop() {}
  succeed() {}
}

const FINISHED = 100
const TEXT_PADDING = 3

export class JobRunner {
  constructor() {
    this.jobsDone = 0
    this.jobsStarted = 0
    this.jobsTotal = 0
    this.masterText = null
    this.initializeSpinner =
      process.env.NODE_ENV !== 'test' && process.stdout.isTTY
        ? async () => (await import('ora')).default()
        : () => new DummySpinner()
  }

  addJobs(jobsCount) {
    this.jobsTotal += jobsCount
  }

  startJob(job) {
    this.jobsStarted += 1
    this.spinner.text = job.name
    if (job.big) {
      this.masterText = job.name
    }
  }

  finishJob(job) {
    this.jobsDone += 1
    if (job.big) {
      this.spinner.succeed(job.name)
    } else {
      this.spinner.text = this.masterText
      this.spinner.start()
    }
  }

  get prefixText() {
    const value = String(
      Math.round((this.jobsDone / this.jobsTotal) * FINISHED)
    )
    return `${' '.repeat(TEXT_PADDING - value.length)}${value}%`
  }

  async initialize() {
    this.spinner = await this.initializeSpinner()
  }

  async runJobs(jobs) {
    this.addJobs(jobs.length)
    for (const job of jobs) {
      if (!this.spinner.isSpinning) {
        this.spinner.start()
      }
      this.startJob(job)
      await job.fn.call()
      this.finishJob(job)
      if (job.after) {
        await job.after.call()
      }
    }
  }
}
