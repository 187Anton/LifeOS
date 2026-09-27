/**
 * Registriert die Auflösung der TypeScript-Quelldateien für den OOXML-Worker.
 *
 * Diese Datei wird als `--import`-Argument an den Worker-Thread übergeben, wenn
 * die Workerdatei eine Quelldatei (`.ts`) ist. Node führt `--import` in jedem
 * Thread aus, deshalb greift die Registrierung dort vor dem Laden der
 * Workerdatei. Im gebündelten Laufzeitpaket wird diese Datei nicht verwendet.
 */
import { register } from "node:module";

/**
 * Der Spezifizierer wird bewusst relativ zur eigenen Adresse übergeben: Die
 * Datei verwendet dadurch keine umgebungsabhängige Laufzeitglobale und bleibt
 * auch in einem Thread lauffähig, in dem nur sie selbst geladen wurde.
 */
register("./ooxml-source-resolver.mjs", { parentURL: import.meta.url });
