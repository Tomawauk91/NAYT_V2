const fs = require('fs');

let content = fs.readFileSync('App.tsx', 'utf8');

// The tricky part with z-index is that the header itself needs a stack context higher than the content div.
content = content.replace(
    '<header className="flex justify-between items-center mb-8 animate-fadeIn">',
    '<header className="flex justify-between items-center mb-8 animate-fadeIn relative z-[100]">'
);

// Need to update the button to include a scale animation on click
let buttonOld = 'className="relative p-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"';
let buttonNew = 'className="relative p-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition transform active:scale-90 duration-200"';
content = content.replace(buttonOld, buttonNew);

// Add an animation to the dropdown panel opening
let dropDownOld = 'className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-[100]"';
let dropDownNew = 'className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-[100] animate-fadeIn"';
content = content.replace(dropDownOld, dropDownNew);

fs.writeFileSync('App.tsx', content);
console.log("App.tsx fixed");
