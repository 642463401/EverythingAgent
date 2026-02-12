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
  // Try python first, then python3
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

  // PDF - try Python with reportlab, fallback to Markdown
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

    const title = (content.title || '文档').replace(/'/g, "\\'")
    const mdContent = generateMarkdownFallback(content).replace(/'/g, "\\'").replace(/\n/g, "\\n")

    const script = `# -*- coding: utf-8 -*-
import sys
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.lib.units import inch
except ImportError:
    print("NEED_INSTALL:reportlab", file=sys.stderr)
    sys.exit(2)

def main():
    doc = SimpleDocTemplate(r'${resolved.replace(/\\/g, '\\\\')}', pagesize=A4)
    styles = getSampleStyleSheet()
    story = []

    # Try to register Chinese font
    try:
        import os
        font_path = os.path.join(os.environ.get('WINDIR', 'C:\\\\Windows'), 'Fonts', 'msyh.ttc')
        if os.path.exists(font_path):
            pdfmetrics.registerFont(TTFont('MSYH', font_path, subfontIndex=0))
            styles.add(ParagraphStyle(name='Chinese', fontName='MSYH', fontSize=12, leading=18))
            styles.add(ParagraphStyle(name='ChineseTitle', fontName='MSYH', fontSize=24, leading=30, spaceAfter=20))
        else:
            styles.add(ParagraphStyle(name='Chinese', parent=styles['Normal']))
            styles.add(ParagraphStyle(name='ChineseTitle', parent=styles['Title']))
    except:
        styles.add(ParagraphStyle(name='Chinese', parent=styles['Normal']))
        styles.add(ParagraphStyle(name='ChineseTitle', parent=styles['Title']))

    story.append(Paragraph('${title}', styles['ChineseTitle']))
    story.append(Spacer(1, 0.3*inch))

    content_lines = '${mdContent}'.split('\\n')
    for line in content_lines:
        if line.strip():
            story.append(Paragraph(line, styles['Chinese']))
            story.append(Spacer(1, 0.1*inch))

    doc.build(story)
    print(f"SUCCESS:{r'${resolved.replace(/\\/g, '\\\\')}' }")

if __name__ == '__main__':
    main()
`

    const scriptPath = await writeTempScript(script)
    try {
      let result = JSON.parse(await runCommand(`${python} "${scriptPath}"`, undefined, 60000))

      if (result.exitCode === 2 || (result.stderr && result.stderr.includes('NEED_INSTALL'))) {
        JSON.parse(await runCommand(`${python} -m pip install reportlab`, undefined, 120000))
        result = JSON.parse(await runCommand(`${python} "${scriptPath}"`, undefined, 60000))
      }

      await cleanupScript(scriptPath)

      if (result.exitCode === 0) {
        const stat = await fsp.stat(resolved)
        return JSON.stringify({
          success: true,
          type: 'pdf',
          path: resolved,
          size: stat.size,
          message: `PDF 文档已生成: ${resolved}`,
        })
      }
    } catch { /* fallthrough to markdown fallback */ }

    await cleanupScript(scriptPath)
    const mdPath = resolved.replace(/\.pdf$/i, '.md')
    const md = generateMarkdownFallback(content)
    const writeResult = await writeFile(mdPath, md)
    const parsed = JSON.parse(writeResult)
    return JSON.stringify({
      ...parsed,
      fallback: true,
      originalType: 'pdf',
      message: `PDF 生成失败，已自动生成 Markdown 格式文档: ${mdPath}`,
    })
  }

  return JSON.stringify({
    error: `不支持的文档类型: ${docType}`,
    supported: ['md', 'docx', 'xlsx', 'pptx', 'pdf'],
  })
}
