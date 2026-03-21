export interface NameData {
  isim: string;
  cinsiyet: string;
  anlam: string;
  kok?: string;
  tip?: string;
  hece_sayisi?: number;
}

const STOP_WORDS = new Set(['bir', 've', 'veya', 'ile', 'olan', 'kişi', 'kadar', 'için', 'gibi', 'çok', 'en', 'da', 'de', 'göre', 'kendi', 'olarak', 'giden', 'gelen', 'yapan', 'edilen', 'kimse', 'ad', 'isim', 'verilen', 'hal', 'durum', 'kız', 'erkek', 'çocuk']);

const FRONT_VOWELS = new Set(['e', 'i', 'ö', 'ü']);
const BACK_VOWELS = new Set(['a', 'ı', 'o', 'u']);

// Phonetic Mapping for Turkish (similar to Soundex)
const PHONETIC_MAP: Record<string, string> = {
  'p': '1', 'b': '1', 'f': '1', 'v': '1', 'm': '1',
  't': '2', 'd': '2', 's': '2', 'z': '2', 'n': '2', 'l': '2', 'r': '2', 'ş': '2', 'c': '2', 'ç': '2', 'j': '2',
  'k': '3', 'g': '3', 'ğ': '3', 'h': '3', 'y': '3',
  'e': '4', 'i': '4', 'ö': '4', 'ü': '4',
  'a': '5', 'ı': '5', 'o': '5', 'u': '5'
};

function getPhoneticHash(word: string): string {
  let hash = '';
  word = word.toLowerCase();
  for (const char of word) {
    if (PHONETIC_MAP[char]) hash += PHONETIC_MAP[char];
  }
  return hash;
}

function getNgrams(word: string, n: number): string[] {
  word = word.toLowerCase();
  const ngrams = [];
  if (word.length < n) return [];
  for (let i = 0; i <= word.length - n; i++) {
    ngrams.push(word.substring(i, i + n));
  }
  return ngrams;
}

function getVowelProfile(word: string): number {
  word = word.toLowerCase();
  let front = 0, back = 0;
  for (const char of word) {
    if (FRONT_VOWELS.has(char)) front++;
    if (BACK_VOWELS.has(char)) back++;
  }
  const total = front + back;
  if (total === 0) return 0;
  return (front - back) / total; 
}

// Levenshtein distance for penalizing names too similar to disliked ones
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (b.charAt(j - 1) === a.charAt(i - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1) // deletion
        );
      }
    }
  }
  return matrix[a.length][b.length];
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[\s,\.\!\?\;:'"()\-]+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

export class MatchEngine {
  private likes: NameData[] = [];
  private dislikes: NameData[] = [];
  
  // IDF Mapping
  private documentCount = 0;
  private dfMap = new Map<string, number>();

  constructor() {}

  // One-time initialization to calculate corpus-wide IDF
  public initializeCorpus(allNames: NameData[]) {
    if (this.documentCount > 0) return; // already initialized
    this.documentCount = allNames.length;
    
    for (const name of allNames) {
      const tokens = new Set(tokenize(name.anlam));
      tokens.forEach(token => {
        this.dfMap.set(token, (this.dfMap.get(token) || 0) + 1);
      });
    }
  }

  private getIDF(term: string): number {
    const df = this.dfMap.get(term) || 1; // avoid log(0)
    // Add 1 to documentCount and df for smoothing
    return Math.log10((this.documentCount + 1) / (df + 1));
  }

  public recordSwipe(name: NameData, liked: boolean) {
    if (liked) this.likes.push(name);
    else this.dislikes.push(name);
  }

  // Multi-Dimensional Vector Profile
  private generateProfile() {
    const profile = {
      bigrams: new Map<string, number>(),
      trigrams: new Map<string, number>(),
      phoneticHashes: new Map<string, number>(),
      startLetters: new Map<string, number>(),
      endLetters: new Map<string, number>(),
      semanticKeywords: new Map<string, number>(), // TF-IDF weighted
      avgLength: 0,
      lengthVariance: 0,
      avgVowelProfile: 0,
      totalLikes: this.likes.length,
      totalDislikes: this.dislikes.length
    };

    if (this.likes.length === 0) return profile;

    let totalLen = 0;
    let totalVowel = 0;
    const lengths: number[] = [];
    
    // Process Likes (Positive vectors)
    this.likes.forEach(item => {
      const nameLower = item.isim.toLowerCase();
      totalLen += nameLower.length;
      lengths.push(nameLower.length);
      totalVowel += getVowelProfile(nameLower);

      // Structural & Phonetic n-grams
      getNgrams(nameLower, 2).forEach(bg => profile.bigrams.set(bg, (profile.bigrams.get(bg) || 0) + 1.5));
      getNgrams(nameLower, 3).forEach(tg => profile.trigrams.set(tg, (profile.trigrams.get(tg) || 0) + 2.5));
      
      const phash = getPhoneticHash(nameLower);
      // Phonetic trigrams
      getNgrams(phash, 3).forEach(ptg => profile.phoneticHashes.set(ptg, (profile.phoneticHashes.get(ptg) || 0) + 2.0));

      // Affixes
      const start = nameLower.charAt(0);
      const end = nameLower.slice(-1);
      profile.startLetters.set(start, (profile.startLetters.get(start) || 0) + 2);
      profile.endLetters.set(end, (profile.endLetters.get(end) || 0) + 2);
      
      // TF-IDF Semantic Keyword Processing
      const words = tokenize(item.anlam);
      const tfMap = new Map<string, number>();
      words.forEach(w => tfMap.set(w, (tfMap.get(w) || 0) + 1));
      
      tfMap.forEach((tf, word) => {
        const idf = this.getIDF(word);
        const tfIdf = tf * idf;
        profile.semanticKeywords.set(word, (profile.semanticKeywords.get(word) || 0) + tfIdf);
      });
    });

    // Process Dislikes (Negative vectors & Penalties)
    this.dislikes.forEach(item => {
      const nameLower = item.isim.toLowerCase();
      
      getNgrams(nameLower, 2).forEach(bg => profile.bigrams.set(bg, (profile.bigrams.get(bg) || 0) - 1.2));
      getNgrams(nameLower, 3).forEach(tg => profile.trigrams.set(tg, (profile.trigrams.get(tg) || 0) - 1.8));

      const phash = getPhoneticHash(nameLower);
      getNgrams(phash, 3).forEach(ptg => profile.phoneticHashes.set(ptg, (profile.phoneticHashes.get(ptg) || 0) - 1.5));

      const start = nameLower.charAt(0);
      const end = nameLower.slice(-1);
      profile.startLetters.set(start, (profile.startLetters.get(start) || 0) - 1.0);
      profile.endLetters.set(end, (profile.endLetters.get(end) || 0) - 1.0);

      // Penalize meaning if strongly disliked
      const words = tokenize(item.anlam);
      words.forEach(word => {
        if (profile.semanticKeywords.has(word)) {
          const idf = this.getIDF(word);
          profile.semanticKeywords.set(word, profile.semanticKeywords.get(word)! - (0.5 * idf));
        }
      });
    });

    profile.avgLength = totalLen / this.likes.length;
    profile.avgVowelProfile = totalVowel / this.likes.length;

    // Calculate Variance
    let sqDiffSum = 0;
    lengths.forEach(l => sqDiffSum += Math.pow(l - profile.avgLength, 2));
    profile.lengthVariance = sqDiffSum / lengths.length;

    return profile;
  }

  public getTopRecommendations(allNames: NameData[], limit = 10): (NameData & { matchScore: number })[] {
    const profile = this.generateProfile();
    if (profile.totalLikes === 0) return [];

    const votedNames = new Set([...this.likes, ...this.dislikes].map(n => n.isim.toLowerCase()));

    // Evaluate all remaining names
    const scoredNames = allNames
      .filter(n => !votedNames.has(n.isim.toLowerCase()))
      .map(name => {
        let score = 0;
        let maxTheoreticalScore = 0;
        const nameLower = name.isim.toLowerCase();

        // 1. Structural N-Grams
        const bigrams = getNgrams(nameLower, 2);
        const trigrams = getNgrams(nameLower, 3);
        
        bigrams.forEach(bg => score += (profile.bigrams.get(bg) || 0));
        trigrams.forEach(tg => score += (profile.trigrams.get(tg) || 0));
        maxTheoreticalScore += (bigrams.length * 1.5 * profile.totalLikes) + (trigrams.length * 2.5 * profile.totalLikes);

        // 2. Phonetic Hashing Matches
        const phash = getPhoneticHash(nameLower);
        const pTrigrams = getNgrams(phash, 3);
        pTrigrams.forEach(ptg => score += (profile.phoneticHashes.get(ptg) || 0));
        maxTheoreticalScore += (pTrigrams.length * 2.0 * profile.totalLikes);

        // 3. Affixes Match
        const start = nameLower.charAt(0);
        const end = nameLower.slice(-1);
        score += (profile.startLetters.get(start) || 0) * 3;
        score += (profile.endLetters.get(end) || 0) * 3;
        maxTheoreticalScore += 12 * profile.totalLikes;

        // 4. Acoustic Profile (Vowel Harmony)
        const vowelProf = getVowelProfile(nameLower);
        const vowelDiff = Math.abs(vowelProf - profile.avgVowelProfile);
        score += Math.max(0, 2 - vowelDiff) * 5 * profile.totalLikes;
        maxTheoreticalScore += 10 * profile.totalLikes;

        // 5. Length Tolerance (Using calculated variance)
        const lenDiff = Math.abs(nameLower.length - profile.avgLength);
        // If variance is high, user tolerates length differences more.
        const tolerance = Math.max(1, Math.sqrt(profile.lengthVariance));
        const lengthScore = Math.max(0, 5 - (lenDiff / tolerance)) * 2 * profile.totalLikes;
        score += lengthScore;
        maxTheoreticalScore += 10 * profile.totalLikes;

        // 6. Semantic TF-IDF Scoring
        const words = tokenize(name.anlam);
        let keywordScore = 0;
        let maxKeywordPotential = 0;
        
        // Sum weights of keywords matched
        words.forEach(w => {
          if (profile.semanticKeywords.has(w)) {
            const weight = profile.semanticKeywords.get(w)!;
            if (weight > 0) keywordScore += weight * 8; // high multiplier for meaning
          }
        });
        
        // Find top 3 semantic keywords in profile to establish theoretical max meaning score
        const topKeywords = Array.from(profile.semanticKeywords.values())
          .filter(v => v > 0)
          .sort((a, b) => b - a)
          .slice(0, 3);
        topKeywords.forEach(v => maxKeywordPotential += v * 8);

        score += Math.min(keywordScore, maxKeywordPotential); 
        maxTheoreticalScore += maxKeywordPotential;

        // 7. Dislike Similarity Penalty (Levenshtein)
        // If a name is extremely similar structurally (1 letter off) to a disliked name, penalize it!
        let penalty = 0;
        for (const dislike of this.dislikes) {
          const dName = dislike.isim.toLowerCase();
          // Fast length check before Levenshtein
          if (Math.abs(dName.length - nameLower.length) <= 2) {
            const dist = levenshtein(nameLower, dName);
            if (dist === 1) penalty += 15 * profile.totalLikes;
            else if (dist === 2) penalty += 5 * profile.totalLikes;
          }
        }
        score -= penalty;

        // Normalize to a percentage (0-100)
        // Empirically, a great match hits about 25-35% of maxTheoreticalScore.
        // So we scale it up, ensuring the best ones approach 90-99%.
        const scalingFactor = 0.30; 
        let normalizedPercentage = maxTheoreticalScore > 0 ? (score / (maxTheoreticalScore * scalingFactor)) * 100 : 0;
        
        normalizedPercentage = Math.max(0, Math.min(99.4, normalizedPercentage));
        
        // Inject minor non-determinism for equal scores to prevent alphabetic clustering
        if (normalizedPercentage < 5) normalizedPercentage += Math.random() * 2;

        return { ...name, matchScore: normalizedPercentage };
      });

    // Final sorting
    scoredNames.sort((a, b) => b.matchScore - a.matchScore);

    // Boost the absolute top tier to >95% to make the user feel confident in the AI
    if (scoredNames.length > 0 && scoredNames[0].matchScore < 95 && scoredNames[0].matchScore > 30) {
      const topScore = scoredNames[0].matchScore;
      // Map highest to 98.7, and scale the rest of the top 50 relative to it
      const boostMultiplier = 98.7 / topScore;
      
      scoredNames.slice(0, 100).forEach((s) => {
        let boosted = s.matchScore * boostMultiplier;
        // Don't let anything surpass 99.8
        if (boosted > 99.8) boosted = 99.8 - (Math.random() * 0.5);
        s.matchScore = Math.round(boosted * 100) / 100;
      });
    } else {
      scoredNames.forEach(s => {
        s.matchScore = Math.round(s.matchScore * 100) / 100;
      });
    }

    return scoredNames.slice(0, limit);
  }
}
