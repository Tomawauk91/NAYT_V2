const fs = require("fs");

let content = fs.readFileSync("services/apiService.ts", "utf8");

if (!content.includes("getMe(): Promise<any>")) {
    content = content.replace(
        "async login(username: string, password: string): Promise<{access_token: string}> {",
        "async getMe(): Promise<any> {\n      const response = await fetch(`${API_BASE_URL}/users/me`, {\n          headers: getHeaders()\n      });\n      if (!response.ok) throw new Error('Failed to get user');\n      return await response.json();\n  },\n\n  async login(username: string, password: string): Promise<{access_token: string}> {"
    );
    fs.writeFileSync("services/apiService.ts", content);
    console.log("apiService.ts patched");
}
