// Android paints a yellow overlay on fields it autofills (name, email…), which clashes with the dark theme.
// Make the app theme's autofill highlight transparent; autofill itself keeps working.
const { withAndroidStyles } = require('expo/config-plugins');

module.exports = function withNoAutofillHighlight(config) {
  return withAndroidStyles(config, (mod) => {
    const appTheme = mod.modResults.resources.style?.find((style) => style.$.name === 'AppTheme');
    if (!appTheme) throw new Error('withNoAutofillHighlight: AppTheme not found in styles.xml');
    appTheme.item = (appTheme.item ?? []).filter(
      (item) => item.$.name !== 'android:autofilledHighlight',
    );
    appTheme.item.push({
      $: { name: 'android:autofilledHighlight' },
      _: '@android:color/transparent',
    });
    return mod;
  });
};
