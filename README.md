You must have Istari compiled on your computer before using the extension. This means you should have a file like `istari/ui/bin/istarisrv-heapimg.amd64-linux` which is the heap image for the Istari UI server.

Once the extension is loaded, open up vscode settings (ctrl + ,) and edit the "Istari: Istari Location" setting to be the absolute path to the istari heap image. If needed, change the "Istari: Sml Location" setting to the command to run sml. You can check to make sure you have the right heap image location and sml command by running this command in your terminal (it should open an sml repl and print the letter f).

`sml @SMLload=ISTARI_HEAP_PATH`

Most of the Emacs Istari commands are included in the extension. The keyboard shortcuts are set to use Ctrl+i instead of the Emacs Ctrl+c because we don't want to override Ctrl+c (copy).
