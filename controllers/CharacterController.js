const Character = require('../models/Character');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const GeminiVisionService = require('../services/GeminiVisionService');
const CharacterService = require('../services/CharacterService');
const { resolveSeriesPath } = require('../services/MediaService');

class CharacterController {
  async analyzeAvatar(req, res) {
    const { id } = req.params;
    try {
        const character = await Character.findById(id);
        if (!character || !character.image) {
            return res.status(404).json({ ok: false, message: "Character or avatar not found" });
        }

        // Handle both old and new paths
        let avatarPath;
        if (character.image.startsWith('/api/images/')) {
            // New path format: /api/images/[seriesId]/characters/[charId]/avatar/[file]
            const parts = character.image.split('/');
            const seriesId = parts[3];
            const charId = parts[5];
            const fileName = parts[7];
            const seriesPath = await resolveSeriesPath(seriesId);
            avatarPath = path.join(seriesPath, 'Characters', charId, 'avatar', fileName);
        } else {
            // Old path format: /views/public/images/characters/...
            avatarPath = path.join(__dirname, '..', character.image);
        }

        if (!fs.existsSync(avatarPath)) {
            return res.status(404).json({ ok: false, message: "Avatar file not found on disk" });
        }

        const prompt = `Provide a detailed physical description of this character for a "Seinen Noir" anime series. 
        Focus on their facial features, hair, clothing, and any distinct accessories or cybernetics.
        Return a JSON object with:
        - description: A concise 2-3 sentence physical profile.
        - alt: A brief accessibility summary.
        - hashtags: An array of 3-5 personality/style hashtags.`;

        console.log(`[CharacterLab] AI Analyzing avatar for: ${character.name}`);
        const visionData = await GeminiVisionService.analyzeImage(avatarPath, prompt);

        // Update the character with the new description
        character.description = visionData.description || character.description;
        await character.save();
        
        // Sync to FS
        await CharacterService.syncCharactersToFS(character.series);

        res.json({ ok: true, description: character.description, hashtags: visionData.hashtags });
    } catch (err) {
        console.error("[CharacterLab] AI Analysis Error:", err);
        res.status(500).json({ ok: false, message: err.message });
    }
  }

  async getAll(req, res) {
    try {
      const characters = await CharacterService.getAllCharacters(req.query.series);
      res.json({ ok: true, characters });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  async getOne(req, res) {
    try {
      const character = await CharacterService.getCharacterByName(req.params.name, req.query.series);
      if (!character) return res.status(404).json({ ok: false, message: 'Character not found' });
      res.json({ ok: true, character });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  async create(req, res) {
    try {
      const character = await CharacterService.createCharacter(req.body);
      res.status(201).json({ ok: true, character });
    } catch (error) {
      res.status(400).json({ ok: false, message: error.message });
    }
  }

  async update(req, res) {
    try {
      const character = await CharacterService.updateCharacter(req.params.id, req.body);
      if (!character) return res.status(404).json({ ok: false, message: 'Character not found' });
      res.json({ ok: true, character });
    } catch (error) {
      res.status(400).json({ ok: false, message: error.message });
    }
  }

  async delete(req, res) {
    try {
      const result = await CharacterService.deleteCharacter(req.params.id);
      if (!result) return res.status(404).json({ ok: false, message: 'Character not found' });
      res.json({ ok: true, message: 'Character deleted successfully' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  async uploadAvatar(req, res) {
    if (!req.file) return res.status(400).json({ ok: false, message: 'No file uploaded' });
    
    try {
        const charId = req.params.id;
        const character = await Character.findById(charId);
        if (!character) return res.status(404).json({ ok: false, message: 'Character not found' });

        const seriesPath = await resolveSeriesPath(character.series);
        const destDir = path.join(seriesPath, 'Characters', charId, 'avatar');
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        const fileName = path.basename(req.file.path);
        const destPath = path.join(destDir, fileName);

        // Move the file from temp storage to series folder
        await fsPromises.rename(req.file.path, destPath);

        const relativePath = `/api/images/${character.series}/characters/${charId}/avatar/${fileName}`;
        
        await CharacterService.updateCharacter(charId, { image: relativePath });
        res.json({ ok: true, image: relativePath });
    } catch (error) {
        console.error("[CharacterLab] Avatar upload error:", error);
        res.status(500).json({ ok: false, message: error.message });
    }
  }

  async uploadReferenceImage(req, res) {
    if (!req.file) return res.status(400).json({ ok: false, message: 'No file uploaded' });

    try {
        const charId = req.params.id;
        const character = await Character.findById(charId);
        if (!character) return res.status(404).json({ ok: false, message: 'Character not found' });

        const seriesPath = await resolveSeriesPath(character.series);
        const destDir = path.join(seriesPath, 'Characters', charId, 'references');
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        const fileName = path.basename(req.file.path);
        const destPath = path.join(destDir, fileName);

        await fsPromises.rename(req.file.path, destPath);

        const relativePath = `/api/images/${character.series}/characters/${charId}/references/${fileName}`;

        const updatedChar = await CharacterService.addReferenceImage(charId, relativePath);
        res.json({ ok: true, url: relativePath, referenceImages: updatedChar.referenceImages });
    } catch (error) {
        console.error("[CharacterLab] Reference upload error:", error);
        res.status(500).json({ ok: false, message: error.message });
    }
  }
}

module.exports = new CharacterController();

