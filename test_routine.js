const { spawn } = require('child_process');

// Simular uma chamada para a API de geração de rotina
const testRoutine = async () => {
  console.log('Testando geração de rotina...');
  
  const curl = spawn('curl', [
    '-X', 'POST',
    'http://localhost:5000/api/weekly-routine/generate',
    '-H', 'Content-Type: application/json',
    '-d', JSON.stringify({
      weekStart: '2025-07-07T20:00:00.000Z'
    }),
    '-H', 'Cookie: connect.sid=s%3A6bN8gFBKQbKnmILOHBbmhvYT-gzjzVvU.6KcKvIDBt7fgB8kGAZNLMfFXrZAWHnhKWGjKLOlJAWA'
  ]);
  
  curl.stdout.on('data', (data) => {
    console.log('Response:', data.toString());
  });
  
  curl.stderr.on('data', (data) => {
    console.error('Error:', data.toString());
  });
  
  curl.on('close', (code) => {
    console.log(`Process exited with code ${code}`);
  });
};

testRoutine();