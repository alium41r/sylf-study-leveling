const http = require('http');

async function run() {
  const username = "testuser_" + Date.now();
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
      console.log('REGISTER STATUS:', res.statusCode);
      const parsed = JSON.parse(data);
      console.log('REGISTER SUCCESS, TOKEN LENGTH:', parsed.token?.length);
      
      if (!parsed.token) return;

      const cookieHeader = res.headers['set-cookie'] 
        ? res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ') 
        : '';
        
      console.log('SENDING COOKIE:', cookieHeader);
        
      const statsReq = http.request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/user/stats',
        method: 'GET',
        headers: {
          'Cookie': cookieHeader,
          'Authorization': `Bearer ${parsed.token}`
        }
      }, (statsRes) => {
        let statsData = '';
        statsRes.on('data', chunk => statsData += chunk);
        statsRes.on('end', () => {
          console.log('STATS STATUS:', statsRes.statusCode);
          console.log('STATS ERR:', statsData.includes('error') ? statsData : 'Success');
          
          // Now try Login API!
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
              console.log('LOGIN STATUS:', loginRes.statusCode);
              const lParsed = JSON.parse(lData);
              const lCookie = loginRes.headers['set-cookie'] 
                ? loginRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ') 
                : '';
                
              console.log('LOGIN COOKIE:', lCookie);
              
              // Now Stats with LOGIN token/cookie
              const statsReq2 = http.request({
                hostname: '127.0.0.1',
                port: 3000,
                path: '/api/user/stats',
                method: 'GET',
                headers: {
                  'Cookie': lCookie,
                  'Authorization': `Bearer ${lParsed.token}`
                }
              }, (sRes2) => {
                let sData2 = '';
                sRes2.on('data', chunk => sData2 += chunk);
                sRes2.on('end', () => {
                  console.log('STATS2 STATUS:', sRes2.statusCode);
                });
              });
              statsReq2.end();
            });
          });
          loginReq.write(loginBody);
          loginReq.end();
        });
      });
      statsReq.end();
    });
  });
  
  req.on('error', e => console.error(e));
  req.write(registerBody);
  req.end();
}

run();
