// Debug script to test the /api/auth/me endpoint directly
import fetch from 'node-fetch';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJVU0VSLTAwMDEiLCJ1c2VyUGxhdGZvcm1JZCI6IlVTRVItMDAwMSIsImVtYWlsIjoicmljYXJkby5hZ25vbG9AaG90bWFpbC5jb20iLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzUyOTUzNTk2LCJleHAiOjE3NTI5NTQ0OTZ9.JMga8x9DSBfJ1bmAJjivC48Q1HTuzloapB_SS9rGyoQ';

console.log('🔍 Testing /api/auth/me endpoint directly...');

async function testEndpoint() {
  try {
    const response = await fetch('http://localhost:5000/api/auth/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const data = await response.json();
    console.log('Response data:', data);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testEndpoint();