const http = require('http');

async function run() {
  const username = "t_" + Date.now().toString().slice(-8);
  const registerBody = JSON.stringify({ 
    email: username + "@example.com", 
    username: username,
    password: "password123",
    name: "Test User"
  });
  
  const req = http.request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/auth/register',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(registerBody)
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('REG STATUS:', res.statusCode);
      const parsed = JSON.parse(data);
      if (!parsed.token) return;

      const loginBody = JSON.stringify({ 
        identifier: username, 
        password: "password123" 
      });
      
      const loginReq = http.request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(loginBody)
        }
      }, (loginRes) => {
        let lData = '';
        loginRes.on('data', chunk => lData += chunk);
        loginRes.on('end', () => {
          console.log('LOG STATUS:', loginRes.statusCode);
          const lParsed = JSON.parse(lData);
          const lCookie = loginRes.headers['set-cookie'] 
            ? loginRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ') 
            : '';
            
          const statsReq = http.request({
            hostname: '127.0.0.1',
            port: 3000,
            path: '/api/user/stats',
            method: 'GET',
            headers: {
              'Cookie': lCookie,
              'Authorization': `Bearer ${lParsed.token}`
            }
          }, (sRes) => {
            let sData = '';
            sRes.on('data', chunk => sData += chunk);
            sRes.on('end', () => {
              console.log('STAT STATUS:', sRes.statusCode);
              console.log('STAT RESPONSE:', sData.substring(0, 50));
            });
          });
          statsReq.end();
        });
      });
      loginReq.write(loginBody);
      loginReq.end();
    });
  });
  
  req.on('error', e => console.error(e));
  req.write(registerBody);
  req.end();
}

run();
