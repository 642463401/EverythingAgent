const pngToIco = require('png-to-ico').default;
const fs = require('fs');
const path = require('path');

async function convertLogoToIcon() {
  try {
    console.log('🔄 正在转换 logo.png 为 Windows ICO 格式...');
    
    const inputPath = './build/logo.png';
    const outputPath = './build/icon.ico';
    
    // 检查输入文件是否存在
    if (!fs.existsSync(inputPath)) {
      throw new Error(`输入文件不存在: ${inputPath}`);
    }
    
    // 确保 build 目录存在
    const buildDir = './build';
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }
    
    // 读取 PNG 文件并转换为 ICO
    const icoBuffer = await pngToIco(inputPath);
    
    // 写入 ICO 文件
    fs.writeFileSync(outputPath, icoBuffer);
    
    // 验证生成的文件
    const stats = fs.statSync(outputPath);
    
    console.log('✅ 图标转换成功！');
    console.log(`📁 输入文件: ${path.resolve(inputPath)}`);
    console.log(`📁 输出位置: ${path.resolve(outputPath)}`);
    console.log(`📊 文件大小: ${(stats.size / 1024).toFixed(1)} KB`);
    console.log('📏 图标尺寸: 多尺寸 ICO 文件（16x16 到 256x256）');
    console.log('\n💡 提示: 此图标将用于:');
    console.log('   • 应用程序窗口标题栏');
    console.log('   • 任务栏图标');
    console.log('   • 安装程序图标');
    console.log('   • 桌面快捷方式');
    
  } catch (error) {
    console.error('❌ 图标转换失败:', error.message);
    console.error('\n💡 解决方案:');
    console.error('   1. 确保 logo.png 文件存在且格式正确');
    console.error('   2. 检查文件权限');
    console.error('   3. PNG 文件应为正方形，推荐 512x512 像素');
    console.error('   4. 可手动使用在线转换工具生成 icon.ico');
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  convertLogoToIcon();
}

module.exports = { convertLogoToIcon };