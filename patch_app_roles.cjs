const fs = require("fs");

let content = fs.readFileSync("App.tsx", "utf8");

const oldRestore = `      if (token && username) {
          // Simple client-side restore for now. 
          // Ideally verify token with backend /me endpoint
          setUser({ id: 'u-1', username: username, role: Role.ADMIN, lastLogin: new Date().toISOString(), password: '', isTempPassword: false });
          fetchMissions();
      }`;

const newRestore = `      if (token && username) {
          toolsService.getMe().then(userData => {
              setUser({ id: userData.id, username: userData.username, role: userData.role || Role.VIEWER, lastLogin: new Date().toISOString(), password: '', isTempPassword: false });
              fetchMissions();
          }).catch(() => {
              localStorage.removeItem('token');
              localStorage.removeItem('username');
              setUser(null);
          });
      }`;

content = content.replace(oldRestore, newRestore);

const oldLogin = `        const data = await toolsService.login(username, password);
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('username', username);
        
        const loggedUser: User = { 
            id: 'u-1', 
            username: username, 
            role: Role.ADMIN, 
            lastLogin: new Date().toISOString(), 
            password: '', 
            isTempPassword: false 
        };`;

const newLogin = `        const data = await toolsService.login(username, password);
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('username', username);
        
        const userData = await toolsService.getMe();
        
        const loggedUser: User = { 
            id: userData.id, 
            username: username, 
            role: userData.role || Role.VIEWER, 
            lastLogin: new Date().toISOString(), 
            password: '', 
            isTempPassword: false 
        };`;

content = content.replace(oldLogin, newLogin);

fs.writeFileSync("App.tsx", content);
console.log("App.tsx patched for proper roles!");
