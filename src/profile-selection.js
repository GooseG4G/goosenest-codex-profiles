function reauthenticationError(message) {
  const error = new Error(message);
  error.code = 'REAUTH_ACCOUNT_MISMATCH';
  return error;
}

function resolveReauthenticationProfile(profiles, info, matchingProfile, profileId) {
  const selectedProfile = profiles.find((profile) =>
    profile.id === profileId && (profile.kind || 'default') === 'default'
  );
  if (!selectedProfile) throw new Error('The profile selected for re-authentication no longer exists.');
  if (matchingProfile && matchingProfile.id !== selectedProfile.id) {
    throw reauthenticationError(
      `Signed in as ${info.name}, but ${selectedProfile.name} was selected for re-authentication.`,
    );
  }

  const comparableAccountIds = selectedProfile.accountId && info.accountId;
  const comparableEmails = selectedProfile.email && info.email;
  const accountMismatch = comparableAccountIds && selectedProfile.accountId !== info.accountId;
  const emailMismatch = !comparableAccountIds && comparableEmails && selectedProfile.email !== info.email;
  if (accountMismatch || emailMismatch) {
    throw reauthenticationError(
      `Signed in as ${info.name}, but ${selectedProfile.name} was selected for re-authentication.`,
    );
  }
  return selectedProfile;
}

module.exports = { resolveReauthenticationProfile };
