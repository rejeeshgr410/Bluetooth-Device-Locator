const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Wire a real release keystore into the generated android/app/build.gradle.
 *
 * This has to be a config plugin rather than a hand edit: `expo prebuild`
 * regenerates android/ from scratch, so any direct change to build.gradle is
 * silently lost on the next run — and you would not find out until you shipped
 * an APK signed with Expo's bundled debug key.
 *
 * Credentials are read from Gradle properties (see ~/.gradle/gradle.properties),
 * never from anything committed. When they are absent the build falls back to
 * the debug key, so a fresh clone still builds without any secrets.
 */

const RELEASE_SIGNING_CONFIG = `        release {
            if (project.hasProperty('WARMER_STORE_FILE')) {
                storeFile file(WARMER_STORE_FILE)
                storePassword WARMER_STORE_PASSWORD
                keyAlias WARMER_KEY_ALIAS
                keyPassword WARMER_KEY_PASSWORD
            }
        }
`;

const DEBUG_SIGNED_RELEASE =
  '// see https://reactnative.dev/docs/signed-apk-android.\n' +
  '            signingConfig signingConfigs.debug';

const REAL_SIGNED_RELEASE =
  '// Signed with the release keystore when WARMER_STORE_FILE is set in\n' +
  '            // ~/.gradle/gradle.properties. Falls back to the debug key so a\n' +
  '            // checkout with no credentials still builds.\n' +
  "            signingConfig project.hasProperty('WARMER_STORE_FILE') ? signingConfigs.release : signingConfigs.debug";

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;

    if (src.includes('WARMER_STORE_FILE')) {
      return cfg; // already applied
    }

    const withConfig = src.replace('signingConfigs {\n', `signingConfigs {\n${RELEASE_SIGNING_CONFIG}`);
    if (withConfig === src) {
      throw new Error(
        'withReleaseSigning: could not find the signingConfigs block in app/build.gradle. ' +
          'The Expo template changed — update this plugin rather than shipping a debug-signed release.',
      );
    }
    src = withConfig;

    const withRelease = src.replace(DEBUG_SIGNED_RELEASE, REAL_SIGNED_RELEASE);
    if (withRelease === src) {
      throw new Error(
        'withReleaseSigning: could not find the release buildType signingConfig in app/build.gradle. ' +
          'The Expo template changed — update this plugin rather than shipping a debug-signed release.',
      );
    }
    src = withRelease;

    cfg.modResults.contents = src;
    return cfg;
  });
};
