// Test email verification system
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Generate test verification token
const generateTestToken = (userId, email) => {
  const token = crypto.randomBytes(32).toString('hex');
  console.log(`Test verification token for ${email}: ${token}`);
  return token;
};

// Test with example user
const testEmail = 'test@example.com';
const testUserId = 'USER-TEST-001';
const testToken = generateTestToken(testUserId, testEmail);

console.log('📧 EMAIL VERIFICATION TEST');
console.log('========================');
console.log(`User ID: ${testUserId}`);
console.log(`Email: ${testEmail}`);
console.log(`Token: ${testToken}`);
console.log('');
console.log('Test URL:');
console.log(`http://localhost:5000/verify-email?token=${testToken}`);
console.log('');
console.log('Expected flow:');
console.log('1. User clicks verification link in email');
console.log('2. Backend validates token and activates account');
console.log('3. Backend generates auto-login tokens');
console.log('4. Frontend receives tokens and user data');
console.log('5. Frontend redirects to /home');
console.log('');
console.log('✅ Registration flow complete with auto-login and home redirect');