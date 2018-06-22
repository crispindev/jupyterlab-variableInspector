import {
    IVariableInspector, VariableInspectorPanel
} from "./variableinspector";

import {
    KernelConnector
} from "./kernelconnector";

import {
    VariableInspectionHandler
} from "./handler";

import {
    VariableInspectorManager
} from "./manager";

import {
    Languages
} from "./inspectorscripts";

import {
    ICommandPalette, InstanceTracker
} from '@jupyterlab/apputils';

import {
    ILayoutRestorer, JupyterLab, JupyterLabPlugin
} from '@jupyterlab/application'

import {
    IConsoleTracker
} from '@jupyterlab/console';

import {
    INotebookTracker, NotebookPanel
} from '@jupyterlab/notebook';




namespace CommandIDs {
    export
        const open = "variableinspector:open";
}

/**
 * A service providing variable introspection.
 */
const variableinspector: JupyterLabPlugin<IVariableInspector> = {
    id: "jupyterlab-extension:variableinspector",
    requires: [ICommandPalette, ILayoutRestorer],
    provides: IVariableInspector,
    autoStart: true,
    activate: ( app: JupyterLab, palette: ICommandPalette, restorer: ILayoutRestorer ): IVariableInspector => {


        const manager = new VariableInspectorManager();
        const category = "Variable Inspector";
        const command = CommandIDs.open;
        const label = "Open Variable Inspector";
        const namespace = "variableinspector";
        const tracker = new InstanceTracker<VariableInspectorPanel>( { namespace } );

        
        /**
         * Create and track a new inspector.
         */
        function newPanel(): VariableInspectorPanel {
            const panel = new VariableInspectorPanel();

            panel.id = "jp-variableinspector";
            panel.title.label = "Variable Inspector";
            panel.title.closable = true;
            panel.disposed.connect(() => {
                if ( manager.panel === panel ) {
                    manager.panel = null;
                }
            } );

            //Track the inspector panel
            tracker.add( panel );

            return panel;
        }

        // Enable state restoration
        restorer.restore( tracker, {
            command,
            args: () => null,
            name: () => "variableinspector"
        } );

        // Add command to palette
        app.commands.addCommand( command, {
            label,
            execute: () => {
                if ( !manager.panel || manager.panel.isDisposed ) {
                    manager.panel = newPanel();
                }
                if ( !manager.panel.isAttached ) {
                    app.shell.addToMainArea( manager.panel );
                }
                if ( manager.source ) {
                    manager.source.performInspection();
                }
                app.shell.activateById( manager.panel.id );
            }
        } );
        palette.addItem( { command, category } );
        
        let label_1 = "foo";
        let command_1 = "MTXInspect";
        app.commands.addCommand(command_1, {
            label: label_1,
            execute: () => {
                manager.source.performMatrixInspection("df");
            }
        });
        palette.addItem({command : command_1, category});
        return manager;
    }
}

/**
 * An extension that registers consoles for variable inspection.
 */
const consoles: JupyterLabPlugin<void> = {
    id: "jupyterlab-extension:variableinspector:consoles",
    requires: [IVariableInspector, IConsoleTracker],
    autoStart: true,
    activate: ( app: JupyterLab, manager: IVariableInspector, consoles: IConsoleTracker ): void => {



        const handlers: { [id: string]: VariableInspectionHandler } = {};

        consoles.widgetAdded.connect(( sender, consolePanel ) => {

            // Get the kernel type and create a new handler if a script exists for that type of kernel.
            let scripts: Promise<Languages.LanguageModel> = Languages.getScript( "python3" );
            scripts.then(( result: Languages.LanguageModel ) => {
                let initScript = result.initScript;
                let queryCommand = result.queryCommand;

                const session = consolePanel.console.session;
                const connector = new KernelConnector( { session } );
                let matrixQueryCommand = result.matrixQueryCommand;

                const options: VariableInspectionHandler.IOptions = {
                    queryCommand: queryCommand,
                    matrixQueryCommand: matrixQueryCommand,
                    connector: connector,
                    initScript: initScript
                };

                const handler = new VariableInspectionHandler( options );

                handlers[consolePanel.id] = handler;

                consolePanel.disposed.connect(() => {
                    delete handlers[consolePanel.id];
                    handler.dispose();
                } );

            } );

            scripts.catch(( result: string ) => {
                console.log( result );
                return;
            } );
        } );

        app.shell.currentChanged.connect(( sender, args ) => {

            let widget = args.newValue;
            if ( !widget || !consoles.has( widget ) ) {
                return;
            }
            let source = handlers[widget.id];
            if ( source ) {
                manager.source = source;
                manager.source.performInspection();
            }
        } );

        //Otherwise log error message.
        app.contextMenu.addItem( {
            command: CommandIDs.open,
            selector: ".jp-CodeConsole"
        } );



    }
}

/**
 * An extension that registers notebooks for variable inspection.
 */
const notebooks: JupyterLabPlugin<void> = {
    id: "jupyterlab-extension:variableinspector:notebooks",
    requires: [IVariableInspector, INotebookTracker],
    autoStart: true,
    activate: ( app: JupyterLab, manager: IVariableInspector, notebooks: INotebookTracker ): void => {

        const handlers: { [id: string]: VariableInspectionHandler } = {};

        /**
         * Watch for new notebook instances
         */
        notebooks.widgetAdded.connect(( sender, nbPanel: NotebookPanel ) => {

            const session = nbPanel.session;
            const connector = new KernelConnector( { session } );
            connector.ready.then(() => {

                // Get the kernel type and create a new handler if a script exists for that type of kernel.
                let kerneltype: string = connector.kerneltype;
                let scripts: Promise<Languages.LanguageModel> = Languages.getScript( kerneltype );
                scripts.then(( result: Languages.LanguageModel ) => {
                    let initScript = result.initScript;
                    let queryCommand = result.queryCommand;
                    let matrixQueryCommand = result.matrixQueryCommand;

                    const options: VariableInspectionHandler.IOptions = {
                        queryCommand: queryCommand,
                        matrixQueryCommand: matrixQueryCommand,
                        connector: connector,
                        initScript: initScript
                    };
                    const handler = new VariableInspectionHandler( options );

                    handlers[nbPanel.id] = handler;

                    nbPanel.disposed.connect(() => {
                        delete handlers[nbPanel.id];
                        handler.dispose();
                    } );
                } );

                //Otherwise log error message.
                scripts.catch(( result: string ) => {
                    console.log( result );
                } )
            } );
        } );

        app.shell.currentChanged.connect(( sender, args ) => {
            let widget = args.newValue;
            if ( !widget || !notebooks.has( widget ) ) {
                return;
            }
            let source = handlers[widget.id];
            if ( source ) {
                manager.source = source;
                manager.source.performInspection();


            }
        } );

        app.contextMenu.addItem( {
            command: CommandIDs.open,
            selector: ".jp-Notebook"
        } );
    }
}


/**
 * Export the plugins as default.
 */
const plugins: JupyterLabPlugin<any>[] = [variableinspector, consoles, notebooks];
export default plugins;
