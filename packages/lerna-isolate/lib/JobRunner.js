const ora = require('ora')

class DummySpinner {
  start () {}
  stop () {}
  succeed () {}
}

class JobRunner {
  jobsDone = 0
  jobsStarted = 0
  jobsTotal = 0
  masterText = null
  spinner = process.stdout.isTTY ? ora() : new DummySpinner()

  addJobs (jobsCount) {
    this.jobsTotal += jobsCount
  }

  startJob (job) {
    this.jobsStarted += 1
    this.spinner.text = job.name
    if (job.big) {
      this.masterText = job.name
    }
  }

  finishJob (job) {
    this.jobsDone += 1
    if (job.big) {
      this.spinner.succeed(job.name)
    } else {
      this.spinner.text = this.masterText
      this.spinner.start()
    }
  }

  get prefixText () {
    const value = String(Math.round((this.jobsDone / this.jobsTotal) * 100))
    return `${' '.repeat(3 - value.length)}${value}%`
  }

  async runJobs (jobs) {
    this.addJobs(jobs.length)
    for (const job of jobs) {
      if (!this.spinner.isSpinning) {
        this.spinner.start()
      }
      this.startJob(job)
      await job.fn.call()
      this.finishJob(job)
    }
  }
}

module.exports = {
  JobRunner
}
