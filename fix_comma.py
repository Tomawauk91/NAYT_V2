with open('services/apiService.ts', 'r') as f:
    text = f.read()

text = text.replace('  },\\n\n', '  },\n')

with open('services/apiService.ts', 'w') as f:
    f.write(text)
