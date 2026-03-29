/**
 * setup-python.js
 * Downloads Python 3.11 embeddable + installs required packages into resources/python/.
 * Run via: npm run setup:python
 * Idempotent — skips everything if python.exe already exists and packages are installed.
 */

const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const os = require('os')

// ==================== Config ====================

const PYTHON_VERSION = '3.11.9'
const PYTHON_DIR = path.join(__dirname, '..', 'resources', 'python')
const PYTHON_EXE = path.join(PYTHON_DIR, 'python.exe')
const REQUIRED_PACKAGES = ['python-docx', 'openpyxl', 'python-pptx', 'reportlab']

const PYTHON_ZIP_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py'

// ==================== Helpers ====================

function log(msg) {
  console.log(`[setup-python] ${msg}`)
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)

    const makeRequest = (reqUrl) => {
      log(`Downloading: ${reqUrl}`)
      const client = reqUrl.startsWith('https://') ? https : http
      const req = client.get(reqUrl, { headers: { 'User-Agent': 'EverythingAgent-Setup/1.0' } }, (res) => {
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          log(`Redirect → ${res.headers.location}`)
          makeRequest(res.headers.location)
          return
        }

        if (res.statusCode !== 200) {
          file.close()
          fs.unlink(destPath, () => {})
          reject(new Error(`HTTP ${res.statusCode} from ${reqUrl}`))
          return
        }

        const total = parseInt(res.headers['content-length'] || '0', 10)
        let downloaded = 0
        let lastPercent = -10

        res.on('data', (chunk) => {
          downloaded += chunk.length
          if (total > 0) {
            const percent = Math.floor((downloaded / total) * 100)
            if (percent >= lastPercent + 10) {
              process.stdout.write(
                `\r[setup-python]   ${percent}% — ${(downloaded / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB`
              )
              lastPercent = percent
            }
          }
        })

        res.pipe(file)
        file.on('finish', () => {
          file.close()
          process.stdout.write('\n')
          resolve()
        })
      })

      req.on('error', (err) => {
        file.close()
        fs.unlink(destPath, () => {})
        reject(err)
      })
    }

    file.on('error', (err) => {
      fs.unlink(destPath, () => {})
      reject(err)
    })

    makeRequest(url)
  })
}

function run(cmd, opts = {}) {
  log(`Run: ${cmd}`)
  execSync(cmd, { stdio: 'inherit', ...opts })
}

function isPackagesInstalled() {
  try {
    execSync(`"${PYTHON_EXE}" -c "import docx, openpyxl, pptx, reportlab"`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

// ==================== Main ====================

async function main() {
  log(`Target directory: ${PYTHON_DIR}`)

  // --- Skip if fully set up ---
  if (fs.existsSync(PYTHON_EXE) && isPackagesInstalled()) {
    log('Bundled Python already set up with all required packages. Skipping.')
    return
  }

  // Ensure resources dir
  fs.mkdirSync(PYTHON_DIR, { recursive: true })

  // --- Download Python embeddable zip ---
  const zipPath = path.join(os.tmpdir(), `python-${PYTHON_VERSION}-embed-amd64.zip`)
  if (!fs.existsSync(PYTHON_EXE)) {
    if (!fs.existsSync(zipPath)) {
      log(`Downloading Python ${PYTHON_VERSION} embeddable...`)
      await downloadFile(PYTHON_ZIP_URL, zipPath)
    } else {
      log(`Using cached zip: ${zipPath}`)
    }

    // --- Extract ---
    log('Extracting Python embeddable...')
    run(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${PYTHON_DIR}' -Force"`)

    // --- Enable site-packages ---
    log('Enabling site-packages in _pth file...')
    const pthFiles = fs.readdirSync(PYTHON_DIR).filter((f) => f.endsWith('._pth'))
    if (pthFiles.length === 0) throw new Error('No ._pth file found in Python directory!')
    for (const pthFile of pthFiles) {
      const pthPath = path.join(PYTHON_DIR, pthFile)
      let content = fs.readFileSync(pthPath, 'utf-8')
      if (content.includes('#import site')) {
        content = content.replace('#import site', 'import site')
        fs.writeFileSync(pthPath, content, 'utf-8')
        log(`Patched ${pthFile}: enabled site-packages`)
      }
    }
  } else {
    log('python.exe exists, skipping download/extraction.')
  }

  // --- Install pip ---
  const pipCheck = (() => {
    try {
      execSync(`"${PYTHON_EXE}" -m pip --version`, { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  })()

  if (!pipCheck) {
    log('Installing pip...')
    const getPipPath = path.join(os.tmpdir(), 'get-pip.py')
    await downloadFile(GET_PIP_URL, getPipPath)
    run(`"${PYTHON_EXE}" "${getPipPath}"`)
  } else {
    log('pip already installed, skipping.')
  }

  // --- Install required packages ---
  log(`Installing packages: ${REQUIRED_PACKAGES.join(', ')}`)
  run(
    `"${PYTHON_EXE}" -m pip install ${REQUIRED_PACKAGES.join(' ')} --no-cache-dir --no-warn-script-location --disable-pip-version-check`
  )

  log('Python setup complete!')
  log(`Python executable: ${PYTHON_EXE}`)
}

main().catch((err) => {
  console.error('\n[setup-python] FAILED:', err.message)
  process.exit(1)
})
