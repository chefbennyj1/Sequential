const Character = require('../models/Character');

class CharacterService {
  async getAllCharacters(seriesId) {
    const filter = seriesId ? { series: seriesId } : {};
    return await Character.find(filter).sort({ name: 1 });
  }

  async getCharacterByName(name, seriesId) {
    const filter = { name };
    if (seriesId) filter.series = seriesId;
    return await Character.findOne(filter);
  }

  async createCharacter(data) {
    const character = new Character(data);
    return await character.save();
  }

  async updateCharacter(id, data) {
    return await Character.findByIdAndUpdate(id, data, { new: true });
  }

  async addReferenceImage(id, imagePath) {
    return await Character.findByIdAndUpdate(
      id,
      { $push: { referenceImages: imagePath } },
      { new: true }
    );
  }

  async deleteCharacter(id) {
    return await Character.findByIdAndDelete(id);
  }
}

module.exports = new CharacterService();
