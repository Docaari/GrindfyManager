// Test script to debug registration flow
// This will be executed in the browser console to simulate clicking REGISTRAR

console.log('🔧 STARTING REGISTRATION DEBUG TEST');
console.log('🔧 Looking for REGISTRAR buttons...');

// Find all REGISTRAR buttons
const registerButtons = document.querySelectorAll('button');
const registrarButtons = Array.from(registerButtons).filter(btn => 
  btn.textContent.includes('🎯 REGISTRAR')
);

console.log('🔧 Found REGISTRAR buttons:', registrarButtons.length);

if (registrarButtons.length > 0) {
  console.log('🔧 Clicking first REGISTRAR button...');
  registrarButtons[0].click();
  console.log('🔧 Button clicked! Check console for registration logs...');
} else {
  console.log('🚨 No REGISTRAR buttons found!');
  
  // Alternative: look for any button with REGISTRAR text
  const allButtons = Array.from(document.querySelectorAll('button'));
  console.log('🔧 All buttons found:', allButtons.length);
  
  const buttonTexts = allButtons.map(btn => btn.textContent);
  console.log('🔧 Button texts:', buttonTexts);
}