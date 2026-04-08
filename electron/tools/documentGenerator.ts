/**
 * Document Generator Tool.
 * Creates Office documents (Word, Excel, PPT), PDF, and Markdown files
 * by generating and executing Python scripts, with Markdown fallback.
 */

import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { app } from 'electron'
import { runCommand } from './commandRunner'
import { writeFile } from './fileTools'
import { getBundledPythonDir } from './pythonHelper'

// ==================== Types ====================

interface DocumentSection {
  heading?: string
  content: string
  level?: number
}

interface PptSlide {
  title: string
  content: string
  layout?: 'title' | 'content' | 'two_column' | 'blank'
}

interface DocumentContent {
  title?: string
  sections?: DocumentSection[]
  slides?: PptSlide[]
  data?: Record<string, any>[]
  raw_content?: string
}

// ==================== Helpers ====================

function safeResolve(filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return path.resolve(filePath)
  }
  try {
    const home = app.getPath('home')
    return path.resolve(home, filePath)
  } catch {
    return path.resolve(filePath)
  }
}

async function checkPython(): Promise<string | null> {
  // 1. Prefer bundled Python (absolute path — guaranteed to have all dependencies)
  const bundledDir = getBundledPythonDir()
  if (bundledDir) {
    const bundledExe = path.join(bundledDir, 'python.exe')
    try {
      const stat = await fsp.stat(bundledExe)
      if (stat.isFile()) {
        console.log('[documentGenerator] Using bundled Python:', bundledExe)
        return `"${bundledExe}"`
      }
    } catch { /* not found, fall through */ }
  }

  // 2. Fallback to system Python via runCommand (PATH injection still applies)
  for (const cmd of ['python', 'python3']) {
    const result = JSON.parse(await runCommand(`${cmd} --version`))
    if (result.exitCode === 0 && result.stdout?.includes('Python')) {
      return cmd
    }
  }
  return null
}

async function writeTempScript(scriptContent: string): Promise<string> {
  const tmpDir = os.tmpdir()
  const scriptName = `ea_docgen_${Date.now()}.py`
  const scriptPath = path.join(tmpDir, scriptName)
  await fsp.writeFile(scriptPath, scriptContent, 'utf-8')
  return scriptPath
}

async function cleanupScript(scriptPath: string): Promise<void> {
  try {
    await fsp.unlink(scriptPath)
  } catch { /* ignore cleanup errors */ }
}

// ==================== Python Script Generators ====================

function generateDocxScript(outputPath: string, content: DocumentContent): string {
  const title = (content.title || '文档').replace(/'/g, "\\'")
  const sections = content.sections || []

  let sectionCode = ''
  for (const sec of sections) {
    const heading = (sec.heading || '').replace(/'/g, "\\'")
    const text = (sec.content || '').replace(/'/g, "\\'").replace(/\n/g, "\\n")
    const level = sec.level || 2
    if (heading) {
      sectionCode += `    doc.add_heading('${heading}', level=${level})\n`
    }
    sectionCode += `    doc.add_paragraph('${text}')\n`
  }

  if (content.raw_content) {
    const raw = content.raw_content.replace(/'/g, "\\'").replace(/\n/g, "\\n")
    sectionCode += `    doc.add_paragraph('${raw}')\n`
  }

  return `# -*- coding: utf-8 -*-
import sys
try:
    from docx import Document
    from docx.shared import Pt, Inches
except ImportError:
    print("NEED_INSTALL:python-docx", file=sys.stderr)
    sys.exit(2)

def main():
    doc = Document()
    doc.add_heading('${title}', level=0)
${sectionCode}
    doc.save(r'${outputPath.replace(/\\/g, '\\\\')}')
    print(f"SUCCESS:{r'${outputPath.replace(/\\/g, '\\\\')}' }")

if __name__ == '__main__':
    main()
`
}

function generatePptxScript(outputPath: string, content: DocumentContent): string {
  const title = (content.title || '演示文稿').replace(/'/g, "\\'")
  const slides = content.slides || []

  let slideCode = ''

  // Title slide
  slideCode += `    slide = prs.slides.add_slide(prs.slide_layouts[0])
    slide.shapes.title.text = '${title}'
    if slide.placeholders[1]:
        slide.placeholders[1].text = ''\n\n`

  for (const slide of slides) {
    const slideTitle = (slide.title || '').replace(/'/g, "\\'")
    const slideContent = (slide.content || '').replace(/'/g, "\\'").replace(/\n/g, "\\n")

    if (slide.layout === 'blank') {
      slideCode += `    slide = prs.slides.add_slide(prs.slide_layouts[6])
    txBox = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(8), Inches(5))
    txBox.text_frame.text = '${slideContent}'\n\n`
    } else {
      slideCode += `    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = '${slideTitle}'
    body = slide.placeholders[1]
    tf = body.text_frame
    tf.text = '${slideContent}'\n\n`
    }
  }

  // If no slides defined but raw_content exists, create a simple content slide
  if (slides.length === 0 && content.raw_content) {
    const raw = content.raw_content.replace(/'/g, "\\'").replace(/\n/g, "\\n")
    slideCode += `    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = '${title}'
    body = slide.placeholders[1]
    tf = body.text_frame
    tf.text = '${raw}'\n\n`
  }

  return `# -*- coding: utf-8 -*-
import sys
try:
    from pptx import Presentation
    from pptx.util import Inches, Pt
except ImportError:
    print("NEED_INSTALL:python-pptx", file=sys.stderr)
    sys.exit(2)

def main():
    prs = Presentation()
${slideCode}
    prs.save(r'${outputPath.replace(/\\/g, '\\\\')}')
    print(f"SUCCESS:{r'${outputPath.replace(/\\/g, '\\\\')}' }")

if __name__ == '__main__':
    main()
`
}

function generateXlsxScript(outputPath: string, content: DocumentContent): string {
  const title = (content.title || 'Sheet1').replace(/'/g, "\\'")
  const data = content.data || []

  let dataCode = ''
  if (data.length > 0) {
    const headers = Object.keys(data[0])
    // Write headers
    headers.forEach((h, i) => {
      dataCode += `    ws.cell(1, ${i + 1}).value = '${h.replace(/'/g, "\\'")}'\n`
    })
    // Write data rows
    dataCode += `    data = ${JSON.stringify(data)}\n`
    dataCode += `    for row_idx, row in enumerate(data, start=2):
        for col_idx, key in enumerate(${JSON.stringify(headers)}, start=1):
            ws.cell(row_idx, col_idx).value = row.get(key, '')\n`
  }

  if (content.raw_content) {
    const raw = content.raw_content.replace(/'/g, "\\'")
    dataCode += `    ws.cell(1, 1).value = '${raw}'\n`
  }

  return `# -*- coding: utf-8 -*-
import sys
try:
    from openpyxl import Workbook
except ImportError:
    print("NEED_INSTALL:openpyxl", file=sys.stderr)
    sys.exit(2)

def main():
    wb = Workbook()
    ws = wb.active
    ws.title = '${title}'
${dataCode}
    wb.save(r'${outputPath.replace(/\\/g, '\\\\')}')
    print(f"SUCCESS:{r'${outputPath.replace(/\\/g, '\\\\')}' }")

if __name__ == '__main__':
    main()
`
}

// ==================== Markdown → PDF Script ====================

function generateMarkdownToPdfScript(outputPath: string, mdFilePath: string, title: string): string {
  const safeOutput = outputPath.replace(/\\/g, '\\\\')
  const safeMdPath = mdFilePath.replace(/\\/g, '\\\\')

  return `# -*- coding: utf-8 -*-
import sys
try:
    import markdown
    from xhtml2pdf import pisa
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.lib.fonts import addMapping
    from xhtml2pdf.default import DEFAULT_FONT
except ImportError:
    print("NEED_INSTALL:markdown,xhtml2pdf", file=sys.stderr)
    sys.exit(2)

def main():
    import os

    # Read markdown source from temp file
    with open(r'${safeMdPath}', 'r', encoding='utf-8') as f:
        md_text = f.read()

    # Convert Markdown to HTML with extensions
    html_body = markdown.markdown(md_text, extensions=[
        'fenced_code',
        'tables',
        'toc',
        'sane_lists',
        'nl2br',
        'attr_list',
    ])

    # Register Chinese font — xhtml2pdf needs THREE steps:
    # 1. registerFont (ReportLab)  2. addMapping  3. DEFAULT_FONT map
    font_family = 'Helvetica, Arial, sans-serif'
    windir = os.environ.get('WINDIR', r'C:\\Windows')
    font_candidates = [
        ('MSYH', 'msyh', os.path.join(windir, 'Fonts', 'msyh.ttc')),
        ('MSYH', 'msyh', os.path.join(windir, 'Fonts', 'msyh.ttf')),
        ('SimSun', 'simsun', os.path.join(windir, 'Fonts', 'simsun.ttc')),
        ('SimHei', 'simhei', os.path.join(windir, 'Fonts', 'simhei.ttf')),
    ]
    for rl_name, css_name, font_path in font_candidates:
        if os.path.exists(font_path):
            try:
                pdfmetrics.registerFont(TTFont(rl_name, font_path, subfontIndex=0))
                addMapping(css_name, 0, 0, rl_name)
                addMapping(css_name, 1, 0, rl_name)
                addMapping(css_name, 0, 1, rl_name)
                addMapping(css_name, 1, 1, rl_name)
                DEFAULT_FONT[css_name] = rl_name
                font_family = '{css}, Helvetica, Arial, sans-serif'.format(css=css_name)
                break
            except Exception:
                continue

    # Build CSS — use .format() with doubled braces for literal CSS braces
    css = """
body {{
    font-family: {font};
    font-size: 12px;
    line-height: 1.6;
    color: #333;
    margin: 0;
    padding: 20px 40px;
}}
h1 {{ font-size: 24px; color: #1a1a1a; border-bottom: 2px solid #e1e4e8; padding-bottom: 8px; margin-top: 24px; }}
h2 {{ font-size: 20px; color: #24292e; border-bottom: 1px solid #e1e4e8; padding-bottom: 6px; margin-top: 20px; }}
h3 {{ font-size: 16px; color: #24292e; margin-top: 16px; }}
h4 {{ font-size: 14px; color: #24292e; margin-top: 14px; }}
h5, h6 {{ font-size: 12px; color: #6a737d; margin-top: 12px; }}
p {{ margin: 8px 0; }}
code {{
    background-color: #f0f0f0;
    padding: 2px 6px;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 11px;
}}
pre {{
    background-color: #f6f8fa;
    border: 1px solid #e1e4e8;
    padding: 12px 16px;
    line-height: 1.45;
}}
pre code {{
    background: none;
    padding: 0;
    font-size: 11px;
}}
blockquote {{
    border-left: 4px solid #dfe2e5;
    padding: 4px 16px;
    margin: 8px 0;
    color: #6a737d;
    background-color: #f9f9f9;
}}
table {{
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
}}
th, td {{
    border: 1px solid #dfe2e5;
    padding: 8px 12px;
    text-align: left;
}}
th {{
    background-color: #f6f8fa;
    font-weight: 600;
}}
ul, ol {{ padding-left: 24px; margin: 8px 0; }}
li {{ margin: 4px 0; }}
hr {{ border: none; border-top: 1px solid #e1e4e8; margin: 16px 0; }}
a {{ color: #0366d6; text-decoration: none; }}
img {{ max-width: 100%; }}
""".format(font=font_family)

    html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
    html += css
    html += '</style></head><body>'
    html += html_body
    html += '</body></html>'

    # Convert HTML to PDF
    with open(r'${safeOutput}', 'wb') as out_file:
        status = pisa.CreatePDF(html, dest=out_file, encoding='utf-8')

    if status.err:
        print(f"PDF conversion error: {status.err}", file=sys.stderr)
        sys.exit(1)

    print(f"SUCCESS:{r'${safeOutput}'}")

if __name__ == '__main__':
    main()
`
}

// ==================== Markdown Fallback ====================

function generateMarkdownFallback(content: DocumentContent): string {
  let md = ''

  if (content.title) {
    md += `# ${content.title}\n\n`
  }

  if (content.sections) {
    for (const sec of content.sections) {
      if (sec.heading) {
        const level = sec.level || 2
        md += `${'#'.repeat(level)} ${sec.heading}\n\n`
      }
      md += `${sec.content}\n\n`
    }
  }

  if (content.slides) {
    for (const slide of content.slides) {
      md += `## ${slide.title}\n\n${slide.content}\n\n---\n\n`
    }
  }

  if (content.data && content.data.length > 0) {
    const headers = Object.keys(content.data[0])
    md += `| ${headers.join(' | ')} |\n`
    md += `| ${headers.map(() => '---').join(' | ')} |\n`
    for (const row of content.data) {
      md += `| ${headers.map((h) => String(row[h] ?? '')).join(' | ')} |\n`
    }
    md += '\n'
  }

  if (content.raw_content) {
    md += content.raw_content + '\n'
  }

  return md || '(空文档)\n'
}

// ==================== Main Function ====================

/**
 * Create a document in the specified format.
 *
 * @param type - Document type: 'docx', 'xlsx', 'pptx', 'pdf', 'md'
 * @param outputPath - Output file path
 * @param content - Document content structure
 * @returns JSON string with result
 */
export async function createDocument(
  type: string,
  outputPath: string,
  content: DocumentContent,
): Promise<string> {
  if (!type || !outputPath) {
    return JSON.stringify({ error: '缺少必要参数: type 和 outputPath' })
  }

  const docType = type.toLowerCase().replace('.', '')
  const resolved = safeResolve(outputPath.trim())

  console.log(`[documentGenerator] Creating ${docType}: ${resolved}`)

  // Ensure output directory exists
  const dir = path.dirname(resolved)
  await fsp.mkdir(dir, { recursive: true })

  // Markdown - direct write, no Python needed
  if (docType === 'md' || docType === 'markdown') {
    const md = generateMarkdownFallback(content)
    return await writeFile(resolved, md)
  }

  // Office formats - try Python, fallback to Markdown
  if (['docx', 'xlsx', 'pptx'].includes(docType)) {
    const python = await checkPython()

    if (!python) {
      // No Python - fallback
      const mdPath = resolved.replace(/\.(docx|xlsx|pptx)$/i, '.md')
      const md = generateMarkdownFallback(content)
      const result = await writeFile(mdPath, md)
      const parsed = JSON.parse(result)
      return JSON.stringify({
        ...parsed,
        fallback: true,
        originalType: docType,
        message: `系统未安装 Python，已自动生成 Markdown 格式文档: ${mdPath}`,
      })
    }

    // Generate Python script
    let script: string
    let requiredLib: string
    switch (docType) {
      case 'docx':
        script = generateDocxScript(resolved, content)
        requiredLib = 'python-docx'
        break
      case 'pptx':
        script = generatePptxScript(resolved, content)
        requiredLib = 'python-pptx'
        break
      case 'xlsx':
        script = generateXlsxScript(resolved, content)
        requiredLib = 'openpyxl'
        break
      default:
        return JSON.stringify({ error: `不支持的文档类型: ${docType}` })
    }

    const scriptPath = await writeTempScript(script)

    try {
      // Try running the script
      let result = JSON.parse(await runCommand(`${python} "${scriptPath}"`, undefined, 60000))

      // If library not installed, try installing it
      if (result.exitCode === 2 || (result.stderr && result.stderr.includes('NEED_INSTALL'))) {
        console.log(`[documentGenerator] Installing ${requiredLib}...`)
        const installResult = JSON.parse(await runCommand(`${python} -m pip install ${requiredLib}`, undefined, 120000))

        if (installResult.exitCode !== 0) {
          // pip install failed - fallback to Markdown
          await cleanupScript(scriptPath)
          const mdPath = resolved.replace(/\.(docx|xlsx|pptx)$/i, '.md')
          const md = generateMarkdownFallback(content)
          const writeResult = await writeFile(mdPath, md)
          const parsed = JSON.parse(writeResult)
          return JSON.stringify({
            ...parsed,
            fallback: true,
            originalType: docType,
            message: `Python 库 ${requiredLib} 安装失败，已自动生成 Markdown 格式文档: ${mdPath}`,
          })
        }

        // Retry after install
        result = JSON.parse(await runCommand(`${python} "${scriptPath}"`, undefined, 60000))
      }

      await cleanupScript(scriptPath)

      if (result.exitCode === 0) {
        // Check file was created
        try {
          const stat = await fsp.stat(resolved)
          return JSON.stringify({
            success: true,
            type: docType,
            path: resolved,
            size: stat.size,
            message: `${docType.toUpperCase()} 文档已生成: ${resolved}`,
          })
        } catch {
          return JSON.stringify({ error: `脚本执行成功但文件未创建: ${resolved}` })
        }
      } else {
        // Script failed - fallback to Markdown
        const mdPath = resolved.replace(/\.(docx|xlsx|pptx)$/i, '.md')
        const md = generateMarkdownFallback(content)
        const writeResult = await writeFile(mdPath, md)
        const parsed = JSON.parse(writeResult)
        return JSON.stringify({
          ...parsed,
          fallback: true,
          originalType: docType,
          message: `Python 脚本执行失败，已自动生成 Markdown 格式文档: ${mdPath}`,
          scriptError: result.stderr || result.stdout,
        })
      }
    } catch (err: any) {
      await cleanupScript(scriptPath)
      // Final fallback
      const mdPath = resolved.replace(/\.(docx|xlsx|pptx)$/i, '.md')
      const md = generateMarkdownFallback(content)
      const writeResult = await writeFile(mdPath, md)
      const parsed = JSON.parse(writeResult)
      return JSON.stringify({
        ...parsed,
        fallback: true,
        originalType: docType,
        message: `文档生成过程出错，已自动生成 Markdown 格式文档: ${mdPath}`,
        error: err.message,
      })
    }
  }

  // PDF - Markdown → HTML → PDF pipeline using markdown + xhtml2pdf
  if (docType === 'pdf') {
    const python = await checkPython()
    if (!python) {
      const mdPath = resolved.replace(/\.pdf$/i, '.md')
      const md = generateMarkdownFallback(content)
      const result = await writeFile(mdPath, md)
      const parsed = JSON.parse(result)
      return JSON.stringify({
        ...parsed,
        fallback: true,
        originalType: 'pdf',
        message: `系统未安装 Python，已自动生成 Markdown 格式文档: ${mdPath}`,
      })
    }

    // Generate Markdown content, then write to a temp file to avoid escaping issues
    const mdContent = generateMarkdownFallback(content)
    const tmpDir = os.tmpdir()
    const mdTmpPath = path.join(tmpDir, `ea_md2pdf_${Date.now()}.md`)
    await fsp.writeFile(mdTmpPath, mdContent, 'utf-8')

    const script = generateMarkdownToPdfScript(resolved, mdTmpPath, content.title || '文档')

    const scriptPath = await writeTempScript(script)
    let lastError = ''

    try {
      let result = JSON.parse(await runCommand(`${python} "${scriptPath}"`, undefined, 60000))

      // Auto-install missing dependencies
      if (result.exitCode === 2 || (result.stderr && result.stderr.includes('NEED_INSTALL'))) {
        console.log('[documentGenerator] Installing markdown + xhtml2pdf...')
        const libs = ['markdown', 'xhtml2pdf']
        for (const lib of libs) {
          const installResult = JSON.parse(await runCommand(`${python} -m pip install ${lib}`, undefined, 120000))
          if (installResult.exitCode !== 0) {
            lastError = `安装 ${lib} 失败: ${installResult.stderr || installResult.stdout}`
          }
        }
        result = JSON.parse(await runCommand(`${python} "${scriptPath}"`, undefined, 60000))
      }

      await cleanupScript(scriptPath)
      try { await fsp.unlink(mdTmpPath) } catch { /* ignore */ }

      if (result.exitCode === 0) {
        try {
          const stat = await fsp.stat(resolved)
          return JSON.stringify({
            success: true,
            type: 'pdf',
            path: resolved,
            size: stat.size,
            message: `PDF 文档已生成: ${resolved}`,
          })
        } catch {
          lastError = `脚本执行成功但文件未创建: ${resolved}`
        }
      } else {
        lastError = result.stderr || result.stdout || '脚本执行返回非零退出码'
        console.error(`[documentGenerator] PDF script failed: ${lastError}`)
      }
    } catch (err: any) {
      lastError = err.message || '未知错误'
      console.error(`[documentGenerator] PDF generation error: ${lastError}`)
    }

    // Cleanup temp files
    await cleanupScript(scriptPath)
    try { await fsp.unlink(mdTmpPath) } catch { /* ignore */ }

    // Fallback to Markdown
    const mdPath = resolved.replace(/\.pdf$/i, '.md')
    const md = generateMarkdownFallback(content)
    const writeResult = await writeFile(mdPath, md)
    const parsed = JSON.parse(writeResult)
    return JSON.stringify({
      ...parsed,
      fallback: true,
      originalType: 'pdf',
      message: `PDF 生成失败，已自动生成 Markdown 格式文档: ${mdPath}`,
      scriptError: lastError,
    })
  }

  return JSON.stringify({
    error: `不支持的文档类型: ${docType}`,
    supported: ['md', 'docx', 'xlsx', 'pptx', 'pdf'],
  })
}
