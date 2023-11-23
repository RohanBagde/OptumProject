package acc.optum.integration.batchprocess

uses acc.optum.integration.OptumOutBoundFileProcess
uses gw.api.database.IQueryBeanResult
uses gw.api.database.Query
uses gw.api.database.Relop
uses gw.processes.BatchProcessBase
uses acc.optum.logger.OptumLoggerUtil

/**
 * Batch Process class to create payment records it runs everyday at 20:30
 */
class OptumOutBoundFileBatchProcess extends BatchProcessBase {

  construct() {
    super(BatchProcessType.TC_OPTUMOUTBOUNDFILE_ACC)
  }

  override function requestTermination() : boolean {
    return false
  }

  /**
   * Method calls OptumPayment class to create OutBound File
   */
  protected override function doWork() {
    var recordsCount = 0
    try {
      var paymentRecords = getEligiblePaymentRecords()
      recordsCount = paymentRecords.Count
      this.OperationsExpected = recordsCount
      OptumLoggerUtil.logDebugLevel("OptumOutBoundFileBatchProcess: writing number of records: ${this.OperationsExpected}", "doWork()")

      //No records
      if (this.OperationsExpected == 0) {
        // Returning from batch
        return
      }
      //Instantiating OptumOutBoundFileProcess class to send paymentRecords in to outbound file
      var outBoundFile = new OptumOutBoundFileProcess()
      OperationsCompleted = outBoundFile.createOutboundRecord(paymentRecords)
      //bundle roll back happens for any errors if file failed so no failed records
    } catch (e : Exception) {
      OptumLoggerUtil.logErrorLevel("OptumOutBoundFileBatchProcess  failed to process records ${e.StackTraceAsString}", "doWork()", :ex = e)
      //for errors bundle  will roll back for all records, so  mapping  failed records as all
      OperationsFailed = recordsCount
      throw e
    }
    OptumLoggerUtil.logDebugLevel("OptumOutBoundFileBatchProcess: Finishing batch job", "doWork()")
  }

  /**
   * Method evaluates eligible records for processing payment record
   *
   * @return IQueryBeanResult<OptumPaymentRecord_Acc>
   */
  private function getEligiblePaymentRecords() : IQueryBeanResult<OptumPaymentRecord_Acc> {
    var paymentRecords = Query.make(entity.OptumPaymentRecord_Acc).compare(OptumPaymentRecord_Acc#PaymentRecordStatus, Relop.Equals, OptumPaymentRecordStatus_Acc.TC_DRAFT).select()
    return paymentRecords
  }
}

