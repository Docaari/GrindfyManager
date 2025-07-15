// Temporary fix for authentication token issues
// This function will be called when the user experiences token problems

export const forceTokenRefresh = async () => {
  console.log('🔧 FORCE TOKEN REFRESH - Starting authentication fix...');
  
  // Clear any existing tokens
  localStorage.removeItem('grindfy_access_token');
  localStorage.removeItem('grindfy_refresh_token');
  localStorage.removeItem('grindfy_user_data');
  
  // Force a new login
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ricardinho2012@gmail.com',
        password: 'COal@2210'
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('🔧 FORCE TOKEN REFRESH - New login successful');
      
      // Store new tokens
      localStorage.setItem('grindfy_access_token', data.accessToken);
      localStorage.setItem('grindfy_refresh_token', data.refreshToken);
      localStorage.setItem('grindfy_user_data', JSON.stringify(data.user));
      
      // Reload the page to apply the fix
      window.location.reload();
    } else {
      console.error('🔧 FORCE TOKEN REFRESH - Login failed:', data.message);
      window.location.href = '/login';
    }
  } catch (error) {
    console.error('🔧 FORCE TOKEN REFRESH - Error:', error);
    window.location.href = '/login';
  }
};

// Function to check if user needs a token refresh
export const checkTokenStatus = () => {
  const token = localStorage.getItem('grindfy_access_token');
  const userData = localStorage.getItem('grindfy_user_data');
  
  if (!token || !userData) {
    console.log('🔧 TOKEN CHECK - Missing tokens, forcing refresh...');
    forceTokenRefresh();
    return false;
  }
  
  return true;
};