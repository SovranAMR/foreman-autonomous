import re

with open('bebek-isim-app/public/index.html', 'r') as f:
    html = f.read()

# Fix currentNameObj init
html = re.sub(
    r"ratingSection\.classList\.add\('fade-in'\);\s*showName\(\);",
    r"ratingSection.classList.add('fade-in');\n            currentNameObj = names[0];\n            showName();",
    html
)

# Fix handleVote definition
html = re.sub(
    r"// Check if algorithm is confident\s*if \(\(data\.highestScore >= 98\.0 && currentIdx >= 40\) \|\| currentIdx >= names\.length\) \{\s*finishRating\(validRecs\);\s*\} else \{\s*// Continue asking\s*showName\(data\.highestScore\);",
    r"""// Gelişmiş Active Learning: Backend'den gelen en uygun soruyu sor
      if (data.nextQuestion) {
         currentNameObj = data.nextQuestion;
      } else {
         currentNameObj = names[currentIdx];
      }

      // Check if algorithm is confident
      if ((data.highestScore >= 98.0 && currentIdx >= 40) || currentIdx >= names.length || !currentNameObj) {
        finishRating(validRecs);
      } else {
        // Continue asking
        showName(data.highestScore);""",
    html
)

with open('bebek-isim-app/public/index.html', 'w') as f:
    f.write(html)
