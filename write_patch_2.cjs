const fs = require("fs");

let content = fs.readFileSync("components/MissionControl.tsx", "utf8");

const s3 = `useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  useEffect(() => {
    if (customScrollRef.current) {
        customScrollRef.current.scrollTop = customScrollRef.current.scrollHeight;
    }
  }, [customTerminalOutput]);`;

if(!content.includes("customScrollRef.current.scrollTop")) {
    content = content.replace(/useEffect\(\(\) => \{\n\s*if \(scrollRef\.current\) \{\n\s*scrollRef\.current\.scrollTop = scrollRef\.current\.scrollHeight;\n\s*\}\n\s*\}, \[terminalOutput\]\);/g, s3);
}

fs.writeFileSync("components/MissionControl.tsx", content);
console.log("MissionControl updated");
