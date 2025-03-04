import AttachFlowPlugin from "src/main";
import { DeleteAllLogsModal } from "src/modals/deletionPrompt";
import { deleteAllAttachs } from "src/options/deleleAllAttachsInTheNote";

export const addCommand = (myPlugin: AttachFlowPlugin) => {
	myPlugin.addCommand({
		id: "clear-all-attachments-in-current-file",
		name: "clear all attachments in current file",
		callback: async () => {
			deleteAllAttachs(myPlugin);
		},
	});

	myPlugin.addCommand({
		id: "delete-file-and-its-attachments",
		name: "delete file and its attachments",
		callback: async () => {
			const note = myPlugin.app.workspace.getActiveFile();
			if (!note || !note.path.endsWith(".md")) {
				return;
			}
			const modal = new DeleteAllLogsModal(note, myPlugin);
			modal.open();
		},
	});
};
