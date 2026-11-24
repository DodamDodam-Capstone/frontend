const fs = require('node:fs/promises');
const path = require('node:path');
const { IOSConfig, withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const filename = 'NanumSquareRound-LICENSE.txt';

async function copyLicense(projectRoot, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(projectRoot, 'assets/fonts/LICENSE.txt'), destination);
}

// expo-font는 TTF만 내장하므로 원본 저작권·OFL 전문도 앱과 함께 배포한다.
module.exports = function withFontLicense(config) {
  config = withDangerousMod(config, ['android', async (result) => {
    const { projectRoot, platformProjectRoot } = result.modRequest;
    await copyLicense(projectRoot, path.join(platformProjectRoot, 'app/src/main/assets/licenses', filename));
    return result;
  }]);

  return withXcodeProject(config, async (result) => {
    const { projectRoot, platformProjectRoot } = result.modRequest;
    const resource = path.join('Resources', filename);
    await copyLicense(projectRoot, path.join(platformProjectRoot, resource));
    IOSConfig.XcodeUtils.ensureGroupRecursively(result.modResults, 'Resources');
    IOSConfig.XcodeUtils.addResourceFileToGroup({
      filepath: resource,
      groupName: 'Resources',
      project: result.modResults,
      isBuildFile: true,
    });
    return result;
  });
};
