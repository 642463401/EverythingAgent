const pngToIco = require('png-to-ico').default;
const fs = require('fs');

async function convertLogoToIcon() {
  try {
    console.log('🔄 正在转换 logo.png 为 Windows ICO 格式...');
    
    // 读取 PNG 文件并转换为 ICO
    const icoBuffer = await pngToIco('./logo.png');
    
    // 确保 build 目录存在
    if (!fs.existsSync('./build')) {
      fs.mkdirSync('./build');
    }
    
    // 写入 ICO 文件
    fs.writeFileSync('./build/icon.ico', icoBuffer);
    
    console.log('✅ 图标转换成功！');
    console.log('📁 输出位置: ./build/icon.ico');
    console.log('📏 图标尺寸: 多尺寸 ICO 文件（16x16 到 256x256）');
    
  } catch (error) {
    console.error('❌ 图标转换失败:', error.message);
    console.error('💡 解决方案:');
    console.error('   1. 确保 logo.png 文件存在且格式正确');
    console.error('   2. 检查文件权限');
    console.error('   3. 可手动使用在线转换工具生成 icon.ico');
  }
}

// 执行转换
convertLogoToIcon();