package acc.optum.plugin.inbound

uses com.guidewire.inboundfile.file.InboundFileImpl
uses com.guidewire.inboundfile.file.InboundInputFile
uses com.guidewire.inboundfile.handler.InboundFileHandler
uses gw.internal.xml.util.StreamUtil
uses gw.transaction.Transaction

uses java.io.BufferedReader

class OptumInboundFileImpl extends InboundFileImpl {

  private static var inboundID : String

  construct(owner : InboundFile) {
    super(owner)
  }

  override function loadFileRecords(handler : InboundFileHandler, file : InboundInputFile) : InboundFile {
    var bundle = Transaction.newBundle()
    var inboundFile = this.getOwner()
    try{
      if (handler.InboundFileConfig.Name == "OptumReconFileHandling") {
        var inboundChunk = new InboundChunk(bundle)
        inboundChunk.setStatus(InboundChunkStatus.TC_LOADING)
        var record = new InboundRecord(bundle)
        var reader = new BufferedReader(StreamUtil.getInputStreamReader(file.Content))
        var lines = reader.readLine()
        var recordContent : String
        while (lines != null) {
          if (recordContent.HasContent) {
            recordContent = recordContent + "\n" + lines
          } else {
            recordContent = lines
          }
          lines = reader.readLine()
        }
        record.Content = recordContent
        record.setLineNumber(1);
        record.setConfig(inboundFile.Config);
        record.setInboundFile(inboundFile);
        record.setStatus(InboundRecordStatus.TC_PENDING);
        record.setInboundChunk(inboundChunk);
        inboundChunk.setStatus(InboundChunkStatus.TC_PENDING)
        reader?.close()
        bundle.commit()
        return inboundFile.refresh() as InboundFile
      } else {
        return super.loadFileRecords(handler, file)
      }
    } catch (e:Exception){
      inboundFile = bundle.add(inboundFile)
      inboundFile.setStatus(InboundFileStatus.TC_ERROR)
      inboundFile.setErrorMessage("Error Occured");
    }
    return null
  }
}