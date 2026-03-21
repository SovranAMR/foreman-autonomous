const fs = require('fs');
let code = fs.readFileSync('bebek-isim-app/index.js', 'utf8');

// Change map to validNames instead of unratedNames
code = code.replace(/const precalcScores = unratedNames\.map/g, 'const precalcScores = validNames.map');

// Fix the nextQuestion logic to only use unratedNames
const newNextQ = `  // Akıllı Soru Seçimi (Active Learning)
  let nextQuestion = null;
  const unratedRecs = recommendations.filter(r => unratedNames.some(u => u.id === r.id));
  if (unratedRecs.length > 0) {
      const qCount = Object.keys(ratings).length;
      if (qCount < 10) {
          nextQuestion = unratedRecs[Math.floor(Math.random() * unratedRecs.length)];
      } else if (qCount < 25) {
          const middleIndex = Math.floor(unratedRecs.length / 2);
          const offset = Math.floor(Math.random() * 10) - 5;
          nextQuestion = unratedRecs[Math.max(0, Math.min(middleIndex + offset, unratedRecs.length - 1))];
      } else {
          nextQuestion = unratedRecs[Math.floor(Math.random() * Math.min(5, unratedRecs.length))];
      }
  }`;

code = code.replace(/\/\/ Akıllı Soru Seçimi \(Active Learning\)[\s\S]*?res\.json\(\{/m, newNextQ + '\n\n  res.json({');

// Remove the early return for unratedNames.length === 0
code = code.replace(/if \(unratedNames\.length === 0\) return res\.json\([^;]+\);/g, '');

fs.writeFileSync('bebek-isim-app/index.js', code);
