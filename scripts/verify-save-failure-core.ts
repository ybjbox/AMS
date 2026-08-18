/**
 * 锁定「保存失败兜底」的共享纯逻辑（saveFailureCore）。
 * 只 import 纯函数模块，避免加载 sonner / zustand-persist（后者会触碰 localStorage）。
 *
 * 关键契约：
 *  - describeSaveError 优先读后端 { error }，其次 { message }，最后原生 Error.message；
 *  - isNetworkOrAuthError 只对「网络错误(isAxiosError)」与「401(code)」返回 true；
 *    后端 4xx/5xx 的 { error } 纯对象必须返回 false（否则会吞掉本该弹出的 toast）。
 */
import { describeSaveError, isNetworkOrAuthError } from '../src/store/saveFailureCore';

let pass = 0;
let fail = 0;
const fails: string[] = [];

function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(name);
    console.log(`  ✗ ${name}`);
  }
}

console.log('describeSaveError:');
check('读后端 { error }', describeSaveError({ error: '部门名称重复' }) === '部门名称重复');
check('读 ApiErrorResponse { message }', describeSaveError({ message: 'token 失效' }) === 'token 失效');
check('读原生 Error.message', describeSaveError(new Error('boom')) === 'boom');
check('空对象回退默认', describeSaveError({}) === '保存失败，请稍后重试');
check('null 回退默认', describeSaveError(null) === '保存失败，请稍后重试');
check('undefined 回退默认', describeSaveError(undefined) === '保存失败，请稍后重试');
check('error 为空串回退到 message', describeSaveError({ error: '', message: 'm' }) === 'm');
check('自定义回退文案', describeSaveError({}, '操作未生效') === '操作未生效');

console.log('isNetworkOrAuthError:');
// 后端 4xx/5xx：纯对象 { error } —— 必须 false（要弹 toast）
check('后端 4xx { error } 不是网络/401（必须弹 toast）', isNetworkOrAuthError({ error: '字段校验失败' }) === false);
check('后端 5xx { error } 不是网络/401', isNetworkOrAuthError({ error: 'Internal Server Error' }) === false);
// 401
check('401 UNAUTHENTICATED', isNetworkOrAuthError({ code: 'UNAUTHENTICATED', error: 'x' }) === true);
check('401 SESSION_EXPIRED', isNetworkOrAuthError({ code: 'SESSION_EXPIRED', error: 'x' }) === true);
// 网络
check('网络错误 isAxiosError', isNetworkOrAuthError({ isAxiosError: true, message: 'Network Error' }) === true);
// 其它
check('普通 Error 非网络/401', isNetworkOrAuthError(new Error('x')) === false);
check('null 非网络/401', isNetworkOrAuthError(null) === false);
check(
  '401 的 { error } 同时带 isAxiosError=false 仍视为 401',
  isNetworkOrAuthError({ code: 'UNAUTHENTICATED', error: '登录失效', isAxiosError: false }) === true
);

// 组合契约：4xx 错误既要有可读信息，又要被判定为「需要弹 toast」
const bizErr = { error: '部门名称不能为空' };
check('4xx 错误可读且需弹 toast', describeSaveError(bizErr) === '部门名称不能为空' && isNetworkOrAuthError(bizErr) === false);

console.log(`\n结果: ${pass}/${pass + fail} 通过`);
if (fail > 0) {
  console.error('失败项: ' + fails.join('; '));
  process.exit(1);
}
console.log('save-failure-core: ALL GREEN');
