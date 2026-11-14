// @ts-check
/**
 * Timer-safe component/modal awaits for panel flows.
 *
 * `Promise.race([collector, new Promise(r => setTimeout(...))])` leaves the
 * losing timer pending for the full timeout (10 minutes here), which keeps the
 * Node event loop alive — tests hang after the last assertion and the bot
 * accumulates one live timer per open panel. Always clear it.
 */

/**
 * @param {any} interaction
 * @param {(i: any) => boolean} filter
 * @param {number} time
 * @returns {Promise<any | null>}
 */
async function awaitComponentSafe(interaction, filter, time) {
  /** @type {NodeJS.Timeout | undefined} */
  let timer;
  try {
    return await Promise.race([
      interaction.channel.awaitMessageComponent({ filter, time }),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), time);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * @param {any} opener interaction that showed the modal
 * @param {(i: any) => boolean} filter
 * @param {number} time
 * @returns {Promise<any | null>}
 */
async function awaitModalSafe(opener, filter, time) {
  /** @type {NodeJS.Timeout | undefined} */
  let timer;
  try {
    return await Promise.race([
      opener.awaitModalSubmit({ filter, time }),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), time);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = { awaitComponentSafe, awaitModalSafe };
