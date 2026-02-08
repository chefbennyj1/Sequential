const CharacterService = require('../services/CharacterService');

class CharacterController {
  async getAll(req, res) {
    try {
      const characters = await CharacterService.getAllCharacters(req.query.series);
      res.json(characters);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getOne(req, res) {
    try {
      const character = await CharacterService.getCharacterByName(req.params.name, req.query.series);
      if (!character) return res.status(404).json({ error: 'Character not found' });
      res.json(character);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async create(req, res) {
    try {
      const character = await CharacterService.createCharacter(req.body);
      res.status(201).json(character);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const character = await CharacterService.updateCharacter(req.params.id, req.body);
      if (!character) return res.status(404).json({ error: 'Character not found' });
      res.json(character);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async delete(req, res) {
    try {
      const result = await CharacterService.deleteCharacter(req.params.id);
      if (!result) return res.status(404).json({ error: 'Character not found' });
      res.json({ message: 'Character deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async uploadAvatar(req, res) {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    // Construct the public path relative to the server root
    // req.file.path is absolute. We need /views/public/...
    // Assumption: The route logic placed the file in the correct folder: views/public/images/characters/{id}/avatar/
    
    // We can normalize the path separator to forward slashes for URLs
    const relativePath = '/' + req.file.path.split('views')[1].replace(/\\/g, '/').replace(/^\//, ''); // Remove leading slash to ensure clean join if needed, but adding '/' at start makes it absolute web path.
    
    // Update the character in the DB
    try {
        const charId = req.params.id;
        await CharacterService.updateCharacter(charId, { image: relativePath });
        res.json({ url: relativePath });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
  }

  async uploadReferenceImage(req, res) {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      // Similar logic to avatar, but might need adjustment depending on where route saves it
      const relativePath = '/' + req.file.path.split('views')[1].replace(/\\/g, '/').replace(/^\//, '');

      try {
          const charId = req.params.id;
          const updatedChar = await CharacterService.addReferenceImage(charId, relativePath);
          res.json({ url: relativePath, referenceImages: updatedChar.referenceImages });
      } catch (error) {
          res.status(500).json({ error: error.message });
      }
  }
}

module.exports = new CharacterController();
