const { randomInt } = require('crypto');
const bcrypt = require('bcryptjs');

function generateSixDigitCode() {
  return String(randomInt(100000, 1000000));
}

async function hashCode(code) {
  return bcrypt.hash(code, 10);
}

async function verifyCode(code, hash) {
  return bcrypt.compare(code, hash);
}

module.exports = { generateSixDigitCode, hashCode, verifyCode };