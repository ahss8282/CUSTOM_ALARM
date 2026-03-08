/**
 * src/assets/licenses.txt → src/assets/licenses.ts 변환 스크립트
 * package.json의 "generate-licenses" 스크립트에서 호출됩니다.
 *
 * 실행: node scripts/build-licenses.js
 */
const fs = require('fs');
const path = require('path');

const txtPath = path.join(__dirname, '../src/assets/licenses.txt');
const tsPath = path.join(__dirname, '../src/assets/licenses.ts');

const content = fs.readFileSync(txtPath, 'utf-8');
// 백틱(`)과 백슬래시(\)를 이스케이프해서 템플릿 리터럴에 안전하게 삽입
const escaped = content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const output = `// 이 파일은 scripts/build-licenses.js가 자동 생성합니다. 직접 수정하지 마세요.
const LICENSES = \`${escaped}\`;
export default LICENSES;
`;

fs.writeFileSync(tsPath, output, 'utf-8');
console.log('licenses.ts 생성 완료:', tsPath);
