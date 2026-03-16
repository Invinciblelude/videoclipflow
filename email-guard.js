const BLOCKED_DOMAINS = new Set([
  'mailinator.com','guerrillamail.com','guerrillamailblock.com','grr.la','guerrillamail.info',
  'guerrillamail.net','guerrillamail.org','guerrillamail.de','sharklasers.com','guerrillamailblock.com',
  'tempmail.com','temp-mail.org','temp-mail.io','throwaway.email','throwaway.com',
  'yopmail.com','yopmail.fr','yopmail.net','cool.fr.nf','jetable.fr.nf','nospam.ze.tc',
  'nomail.xl.cx','mega.zik.dj','speed.1s.fr','courriel.fr.nf','moncourrier.fr.nf',
  'trashmail.com','trashmail.me','trashmail.net','trashmail.org','trashmail.io',
  'fakeinbox.com','fakemail.net','mailnesia.com','maildrop.cc','dispostable.com',
  'getnada.com','tempr.email','tempail.com','mohmal.com','burnermail.io',
  'mailsac.com','inboxkitten.com','33mail.com','spam4.me','spamgourmet.com',
  'mytemp.email','tempmailo.com','tempmailaddress.com','tmpmail.net','tmpmail.org',
  'moakt.com','emailondeck.com','mintemail.com','emailfake.com','crazymailing.com',
  'armyspy.com','cuvox.de','dayrep.com','einrot.com','fleckens.hu','gustr.com',
  'jourrapide.com','rhyta.com','superrito.com','teleworm.us',
  'mailcatch.com','mailexpire.com','mailforspam.com','mailhazard.com','mailhazard.us',
  'mailhz.me','mailimate.com','mailinater.com','mailincubator.com','mailme.lv',
  'mailnull.com','mailshell.com','mailsiphon.com','mailslite.com','mailzilla.com',
  'sharklasers.com','spamherelots.com','spamhereplease.com','spamthisplease.com',
  'safetymail.info','10minutemail.com','10minutemail.net','20minutemail.com',
  'harakirimail.com','maildu.de','mailforspam.com','mailfree.ga','mailfreeonline.com',
  'anonbox.net','binkmail.com','bobmail.info','burnthismail.com','devnullmail.com',
  'dodgit.com','e4ward.com','emailigo.de','emailsensei.com','emailtemporario.com.br',
  'ephemail.net','filzmail.com','getairmail.com','guerrillamail.biz',
]);

function isDisposableEmail(email) {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1].toLowerCase();
  return BLOCKED_DOMAINS.has(domain);
}

function validateEmail(email) {
  if (!email || !email.includes('@')) {
    return { valid: false, reason: 'Please enter a valid email address.' };
  }

  const domain = email.split('@')[1].toLowerCase();

  if (isDisposableEmail(email)) {
    return { valid: false, reason: 'Temporary email addresses are not allowed. Please use a real email.' };
  }

  if (domain.length < 4 || !domain.includes('.')) {
    return { valid: false, reason: 'Please enter a valid email address.' };
  }

  const parts = domain.split('.');
  const tld = parts[parts.length - 1];
  if (tld.length < 2) {
    return { valid: false, reason: 'Please enter a valid email address.' };
  }

  return { valid: true };
}
