Streamable HTTP Endpoint  //墨迹天气查询
https://dashscope.aliyuncs.com/api/v1/mcps/market-cmapi013828/mcp
SSE Endpoint //12306火车票查询
https://dashscope.aliyuncs.com/api/v1/mcps/china-railway/sse
Streamable HTTP Endpoint //代码解释器
https://dashscope.aliyuncs.com/api/v1/mcps/code_interpreter_mcp/mcp
SSE Endpoint //飞常准机票查询
https://dashscope.aliyuncs.com/api/v1/mcps/Aviation/sse
SSE Endpoint //md转文档
https://dashscope.aliyuncs.com/api/v1/mcps/docMind/sse
SSE Endpoint //高德地图
https://dashscope.aliyuncs.com/api/v1/mcps/amap-maps/sse
SSE Endpoint // AIOCR
https://dashscope.aliyuncs.com/api/v1/mcps/ai-ocr/sse
SSE Endpoint// 今天吃什么
https://dashscope.aliyuncs.com/api/v1/mcps/how-to-cook/sse



鉴权方式
获取 DASHSCOPE_API_KEY，并添加至 header 中进行鉴权，鉴权方式参考：
鉴权方式：获取 DASHSCOPE_API_KEY，替换配置文件中的${DASHSCOPE_API_KEY}

AIOCR描述如下：
为了给AI大模型提供高质量文档数据，AIOCR 提供多种文档识别能力，格式包括 .pdf .txt .csv .doc .docx .xls .xlsx .ppt .pptx .md .jpeg .png .bmp .gif .svg .svgz .webp .ico .xbm .dib .pjp .tif .pjpeg .avif .dot .apng .epub .tiff .jfif .html .json .mobi .log .go .h .c .cpp .cxx .cc .cs .java .js .css .jsp .php .py .py3 .asp .yaml .yml .ini .conf .ts .tsx 等格式，支持文档转文本、文档转markdown的识别能力。