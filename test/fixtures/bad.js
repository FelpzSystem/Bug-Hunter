const apiKey = 'sk-THIS_IS_A_FAKE_TEST_TOKEN_123456789';
const insecure = 'http://example.com/api';
let x = 1;
var y = 2;

if (true) {
  x = x;
}

const value = parseInt('42');
if (value == NaN) console.log('bad');

eval('console.log(1)');
const Fn = new Function('return 1');
setTimeout('alert(1)', 10);

document.body.innerHTML = userInput;
document.write(userInput);

const obj = { a: 1, a: 2 };
switch (x) {
  case 1: break;
  case 1: break;
}

function longAndCrazy(flag) {
  if (flag) { x++; } else { x--; }
  if (flag) { x++; } else { x--; }
  if (flag) { x++; } else { x--; }
  if (flag) { x++; } else { x--; }
  if (flag) { x++; } else { x--; }
  if (flag) { x++; } else { x--; }
  if (flag) { x++; } else { x--; }
  if (flag) { x++; } else { x--; }
  if (flag) { x++; } else { x--; }
  if (flag) { x++; } else { x--; }
  if (flag) { x++; } else { x--; }
  if (flag) { x++; } else { x--; }
  return x;
  console.log('unreachable');
}

new Promise(async (resolve) => resolve(1));

try {
  JSON.parse('{');
} catch (err) {
}

throw 'boom';

async function pointless() {
  return 42;
}

for (const n of [1, 2, 3]) {
  awaitThing(n);
}

function suspiciousRegex(input) {
  return /(a+)+$/.test(input);
}

child_process.exec(userInput);

async function sequential(items) {
  for (const item of items) {
    await doSomething(item);
  }
}
