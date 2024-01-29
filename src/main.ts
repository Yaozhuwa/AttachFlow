import { Menu, MenuItem, Notice, Plugin, TFile, MarkdownView, Platform } from "obsidian";
import { addCommand } from "./config/addCommand-config";
import { NathanImageCleanerSettingsTab } from "./settings";
import { NathanImageCleanerSettings, DEFAULT_SETTINGS } from "./settings";
import * as Util from "./util";
import { getMouseEventTarget } from "./utils/handlerEvent";
import { DeleteAllLogsModal } from "./modals/deletionPrompt";
import { EditorView, keymap, ViewUpdate } from '@codemirror/view';
import {
	ElectronWindow, FileSystemAdapterWithInternalApi,
	loadImageBlob, AppWithDesktopInternalApi, EditorInternalApi, onElement
} from "./helpers"

interface Listener {
	(this: Document, ev: Event): any;
}

export default class NathanImageCleaner extends Plugin {
	settings: NathanImageCleanerSettings;

	async onload() {
		console.log("Fast file Cleaner plugin loaded...");

		this.addSettingTab(new NathanImageCleanerSettingsTab(this.app, this));

		await this.loadSettings();
		this.registerDocument(document);

		app.workspace.on("window-open", (workspaceWindow, window) => {
			this.registerDocument(window.document);
		});
		// add contextmenu on file context
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile) {
					const addMenuItem = (item: MenuItem) => {
						item.setTitle("Remove the file and its attachments")
							.setIcon("trash-2")
							.setSection("danger");
						item.onClick(async () => {
							const modal = new DeleteAllLogsModal(file, this);
							modal.open();
						});
					};
					menu.addItem(addMenuItem);
				}
			})
		);
		// register all commands in addCommand function
		addCommand(this);
	}

	onunload() {
		console.log("Fast file Cleaner plugin unloaded...");
	}

	registerDocument(document: Document) {
		this.register(
			onElement(
				document,
				"contextmenu" as keyof HTMLElementEventMap,
				"img, iframe, video, div.file-embed-title,audio",
				this.onClick.bind(this)
			)
		);
		/* 	this.register(
				this.onElement(
					document,
					"contextmenu" as keyof HTMLElementEventMap,
					"div.nav-file",
					this.IsdeleteNoteWithItsAllAttachments.bind(this)
				)) */
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
	registerEscapeButton(menu: Menu, document: Document = activeDocument) {
		menu.register(
			onElement(
				document,
				"keydown" as keyof HTMLElementEventMap,
				"*",
				(e: KeyboardEvent) => {
					if (e.key === "Escape") {
						e.preventDefault();
						e.stopPropagation();
						menu.hide();
					}
				}
			)
		);
	}


	/**
	 * 设置菜单按钮，并设置点击事件
	 *
	 * @param menu
	 * @param FileBaseName
	 * @param currentMd
	 */
	addMenuExtendedSourceMode = (menu: Menu, FileBaseName: string, currentMd: TFile, target_type: string, target_line: number, target_ch: number) => {
		menu.addItem((item: MenuItem) =>
			item
				.setIcon("trash-2")
				.setTitle("Clear file and associated link")
				// .setChecked(true)
				.onClick(async () => {
					try {
						// Util.handlerDelFile(FileBaseName, currentMd, this);
						Util.handlerDelFileNew(FileBaseName, currentMd, this, target_type, target_line, target_ch);
					} catch {
						new Notice("Error, could not clear the file!");
					}
				})
		);
		this.addMenuExtendedPreviewMode(menu, FileBaseName, currentMd);
	};


	/**
	 * 设置菜单按钮，并设置点击事件
	 *
	 * @param menu
	 * @param FileBaseName
	 * @param currentMd
	 */
	addMenuExtendedPreviewMode = (menu: Menu, FileBaseName: string, currentMd: TFile) => {
		const file = Util.getFileByBaseName(currentMd, FileBaseName) as TFile;
		const basePath = (file.vault.adapter as any).basePath;
		const relativeFilePath = file.path;

		menu.addItem((item: MenuItem) =>
			item
				.setIcon("copy")
				.setTitle("Copy file to clipboard")
				// .setChecked(true)
				.onClick(async () => {
					try {
						Util.handlerCopyFile(FileBaseName, currentMd, this);
					} catch {
						new Notice("Error, could not copy the file!");
					}
				})
		);
		menu.addItem((item: MenuItem) => item
			.setIcon("arrow-up-right")
			.setTitle("Open in default app")
			.onClick(() => (this.app as AppWithDesktopInternalApi).openWithDefaultApp(file.path))
		);
		menu.addItem((item: MenuItem) => item
			.setIcon("arrow-up-right")
			.setTitle(Platform.isMacOS ? "Reveal in finder" : "Show in system explorer")
			.onClick(() => {
				(this.app as AppWithDesktopInternalApi).showInFolder(file.path);
			})
		);
		menu.addItem((item: MenuItem) => item
			.setIcon("folder")
			.setTitle("Reveal file in navigation")
			.onClick(() => {
				const abstractFilePath = this.app.vault.getAbstractFileByPath(file.path);
				(this.app as any).internalPlugins.getEnabledPluginById("file-explorer").revealInFolder(abstractFilePath);
			})
		);
	};


	/**
	 * 鼠标点击事件
	 */
	onClick(event: MouseEvent) {
		const target = getMouseEventTarget(event);
		const curTargetType = target.localName;
		// console.log(target.parentElement)
		// console.log('target, localName', target, target.localName)

		const currentMd = app.workspace.getActiveFile() as TFile;

		const RegFileBaseName = new RegExp(/\/?([^\/\n]+\.\w+)/, "m");
		let target_name = target.parentElement?.getAttribute("src") as string;
		const FileBaseName = (target_name?.match(RegFileBaseName) as string[])[1];
		const SupportedTargetType = ["img", "iframe", "video", "div", "audio"];

		const menu = new Menu();

		if (!SupportedTargetType.includes(curTargetType)) return;

		// 判断当前是否是阅读模式
		// console.log('Mode:', this.app.workspace.getActiveViewOfType(MarkdownView)?.getMode());
		if (this.app.workspace.getActiveViewOfType(MarkdownView)?.getMode() == "preview") {
			if (SupportedTargetType.includes(curTargetType)) {
				// console.log("FileBaseName", FileBaseName);
				this.addMenuExtendedPreviewMode(menu, FileBaseName, currentMd);
			}
		}
		else{
			const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
			//  @ts-expect-error, not typed
			const editorView = editor.cm as EditorView;
			const target_pos = editorView.posAtDOM(target);
			// const prev_pos = editorView.posAtDOM(target.parentElement?.previousElementSibling as HTMLElement);
			// const next_pos = editorView.posAtDOM(target.parentElement?.nextElementSibling as HTMLElement);
			// let prev_target_line = editorView.state.doc.lineAt(prev_pos);
			// let next_target_line = editorView.state.doc.lineAt(next_pos);
			// console.log('prev target line information: line-content, line-number(1-based), target.ch');
			// console.log(prev_target_line.text, prev_target_line.number, prev_pos-prev_target_line.from)

			let target_line = editorView.state.doc.lineAt(target_pos);
			// console.log('target line information: line-content, line-number(1-based), target.ch');
			// console.log(target_line.text, target_line.number, target_pos - target_line.from)

			// console.log('next target line information: line-content, line-number(1-based), target.ch');
			// console.log(next_target_line.text, next_target_line.number, next_pos-next_target_line.from)

			if (SupportedTargetType.includes(curTargetType)) {
				// console.log("FileBaseName", FileBaseName);
				this.addMenuExtendedSourceMode(menu, FileBaseName, currentMd, curTargetType, target_line.number, target_pos - target_line.from);
			}
		}

		this.registerEscapeButton(menu);
		menu.showAtPosition({ x: event.pageX, y: event.pageY });
		this.app.workspace.trigger("NL-fast-file-cleaner:contextmenu", menu);
	}

	/* IsdeleteNoteWithItsAllAttachments = async (event: MouseEvent):Promise<boolean> => {
		// 1.get mouse event target
		const nav_file_title = getMouseEventTarget(event);
		const data_path = nav_file_title.getAttribute('data-path') as string;
		const isMdFile = data_path.match(/.*\.md/) !== null;
		// 2.if the target is a element  representing .md file ,then delete the note
		return isMdFile ? true : false;
	} */
}