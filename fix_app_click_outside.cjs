const fs = require('fs');

let content = fs.readFileSync('App.tsx', 'utf8');

// 1. Import useRef
content = content.replace(
    "import React, { useState, useEffect } from 'react';",
    "import React, { useState, useEffect, useRef } from 'react';"
);

// 2. Add ref declaration
content = content.replace(
    "const [showUsersDropdown, setShowUsersDropdown] = useState(false);",
    "const [showUsersDropdown, setShowUsersDropdown] = useState(false);\n  const usersDropdownRef = useRef<HTMLDivElement>(null);"
);

// 3. Add useEffect for click outside
const useEffectCode = `
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (usersDropdownRef.current && !usersDropdownRef.current.contains(event.target as Node)) {
        setShowUsersDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
`;
content = content.replace(
    "const [activeView, setActiveView] = useState('dashboard');",
    useEffectCode + "\n  const [activeView, setActiveView] = useState('dashboard');"
);

// 4. Attach ref to the dropdown container
const divOld = '<div className="relative z-[100]">';
const divNew = '<div className="relative z-[100]" ref={usersDropdownRef}>';
content = content.replace(divOld, divNew);

fs.writeFileSync('App.tsx', content);
console.log("App.tsx fixed click outside");
