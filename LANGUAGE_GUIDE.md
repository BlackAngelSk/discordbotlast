# 🌍 Viacjazyčná Podpora / Multi-Language Support

## Prehľad / Overview

Bot teraz podporuje viacjazyčné prekladyjazyková podpora! Admini môžu nastaviť jazyk pre svoj server a bot bude používať zvolený jazyk len na danom serveri.

The bot now supports multi-language translations! Admins can set the language for their server and the bot will use the selected language only on that server.

## Dostupné Jazyky / Available Languages

- 🇬🇧 **English** (`en`)
- 🇸🇰 **Slovenčina** (`sk`)

## Ako Nastaviť Jazyk / How to Set Language

### Pre Adminov / For Admins

Použite príkaz / Use the command:
```
!config language <kód jazyka / language code>
```

**Príklady / Examples:**
```
!config language sk    # Nastaví slovenčinu / Sets Slovak
!config language en    # Nastaví angličtinu / Sets English
!config lang sk        # Skrátená verzia / Short version
```

### Zoznam Jazykov / List Languages

Ak chcete vidieť dostupné jazyky, použite / To see available languages, use:
```
!config language
```

## Ako Pridať Nový Jazyk / How to Add a New Language

1. **Vytvorte nový súbor / Create a new file:**
   - Prejdite do priečinka `languages/`
   - Vytvorte súbor `XX.json` (napr. `de.json` pre nemčinu)
   - Go to the `languages/` folder
   - Create a file `XX.json` (e.g., `de.json` for German)

2. **Skopírujte štruktúru / Copy the structure:**
   ```json
   {
     "languageName": "Deutsch",
     "languageCode": "de",
     "common": {
       "error": "Ein Fehler ist aufgetreten",
       "success": "Erfolg!",
       ...
     },
     "config": {
       ...
     }
   }
   ```

3. **Reštartujte bota / Restart the bot:**
   ```bash
   npm start
   ```

## Pre Vývojárov / For Developers

### Použitie Prekladov v Príkazoch / Using Translations in Commands

```javascript
const languageManager = require('../../utils/languageManager');

module.exports = {
    name: 'example',
    description: 'Example command',
    async execute(message, args, client) {
        // Jednoduchý preklad / Simple translation
        const text = languageManager.get(
            message.guild.id, 
            'commands.example.message'
        );
        
        // S premennými / With variables
        const greeting = languageManager.get(
            message.guild.id,
            'commands.hello.response',
            { user: message.author.username }
        );
        
        await message.reply(greeting);
    }
};
```

### Štruktúra Prekladových Kľúčov / Translation Key Structure

Používajte bodkovanú notáciu / Use dot notation:
```
common.error
common.success
config.title
config.prefixChanged
commands.hello.response
```

### Premenné v Prekladoch / Variables in Translations

V prekladových súboroch / In translation files:
```json
{
  "welcome": "Vitaj, {user}! Si na serveri {server}."
}
```

V kóde / In code:
```javascript
languageManager.get(guildId, 'welcome', {
    user: username,
    server: serverName
});
```

## Príklady Príkazov / Command Examples

### Nastavenie Jazyka / Setting Language
```
!config language sk
✅ Jazyk zmenený na: **Slovenčina** (sk)
```

### Zobrazenie Konfigurácie / Showing Configuration
```
!config
```
**Slovenčina:**
```
⚙️ Nastavenia Servera
Aktuálne nastavenia bota pre tento server:
🔧 Prefix: `!`
🌍 Jazyk: SK
...
```

**English:**
```
⚙️ Server Configuration
Current bot settings for this server:
🔧 Prefix: `!`
🌍 Language: EN
...
```

### Príkaz Hello / Hello Command
```
!hello
```
**Slovenčina:**
```
👋 Ahoj, John! Ako sa máš dnes?
```

**English:**
```
👋 Hello, John! How are you today?
```

## Vlastnosti / Features

✅ **Server-Specific** - Každý server môže mať svoj vlastný jazyk / Each server can have its own language  
✅ **Easy to Add** - Jednoduché pridanie nových jazykov / Easy to add new languages  
✅ **Fallback System** - Automaticky sa vráti na angličtinu ak preklad chýba / Automatically falls back to English if translation is missing  
✅ **Variable Support** - Podpora premenných v prekladoch / Support for variables in translations  
✅ **Hot Reload** - Možnosť načítať preklady bez reštartu bota / Ability to reload translations without restarting bot  

## Riešenie Problémov / Troubleshooting

### Preklad sa nezobrazuje / Translation doesn't show

1. Skontrolujte, či súbor jazyka existuje v `languages/` / Check if language file exists in `languages/`
2. Overte správnosť JSON syntaxe / Verify JSON syntax is correct
3. Reštartujte bota / Restart the bot
4. Skontrolujte console logy / Check console logs for errors

### Chyba "Translation not found"

1. Skontrolujte, či kľúč existuje v jazykovom súbore / Check if key exists in language file
2. Skontrolujte správnosť bodkovej notácie / Verify dot notation is correct
3. Pridajte chýbajúci preklad / Add missing translation

## Budúce Vylepšenia / Future Improvements

- 🔄 Automatická detekcia jazyka zo servera
- 📊 Štatistiky použitia jazykov
- 🌐 Viac jazykov (nemčina, francúzština, španielčina, atď.)
- 🔄 Automatic language detection from server
- 📊 Language usage statistics  
- 🌐 More languages (German, French, Spanish, etc.)
