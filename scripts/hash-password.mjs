// Run this locally. Password is read from the TTY, never argv/environment/logs.
import { emitKeypressEvents } from 'node:readline';
import { hashPassword } from '../server/lib/auth.js';
if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('请在交互式本机终端运行此脚本');
async function hidden(prompt) {
  process.stdout.write(prompt);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let input = '';
    function finish(error) {
      process.stdin.off('keypress', keypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(input);
    }
    function keypress(text, key = {}) {
      if (key.ctrl && key.name === 'c') return finish(new Error('已取消'));
      if (key.name === 'return') return finish();
      if (key.name === 'backspace') input = input.slice(0, -1);
      else if (!key.ctrl && !key.meta && text) input += text;
    }
    process.stdin.on('keypress', keypress);
  });
}
const password = await hidden('输入至少 16 字符的个人密码（不回显）：');
const confirm = await hidden('再次输入密码：');
if (password !== confirm) throw new Error('两次密码不一致');
console.log(`AUTH_PASSWORD_HASH='${await hashPassword(password)}'`);
console.log('将以上哈希保存在服务端配置中；不要提交仓库或公开分享。');
