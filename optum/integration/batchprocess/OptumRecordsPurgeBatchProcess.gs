package acc.optum.integration.batchprocess

uses acc.optum.OptumConstants
uses acc.optum.logger.OptumLoggerUtil
uses acc.optum.runtimeproperties.OptumRuntimeProperties
uses gw.api.database.IQueryBeanResult
uses gw.api.database.Query
uses gw.api.database.Relop
uses gw.api.util.DateUtil
uses gw.processes.BatchProcessBase

/**
 * Class to Purge Optum Payment Records since past one year of Create Time
 */
class OptumRecordsPurgeBatchProcess extends BatchProcessBase {

  construct() {
    super(BatchProcessType.TC_OPTUMRECORDSPURGE_ACC)
  }

  override function requestTermination() : boolean {
    return false
  }

  /**
   * Method Removes Optum Payment Records since Past one year from create time
   */
  protected override function doWork() {
    try {
      //getting Eligible Payment Records
      var paymentRecords = getEligiblePaymentRecords()
      this.OperationsExpected = paymentRecords.Count
      OptumLoggerUtil.logDebugLevel("Total Eligible Records Count :${OperationsExpected}","doWork()")
      //No records
      if (OperationsExpected == OptumConstants.ZERO) {
        // Returning from batch
        return
      }
      if (paymentRecords.HasElements) {
        gw.transaction.Transaction.runWithNewBundle(\bundle -> {
          paymentRecords.each(\paymentRecord -> {
            paymentRecord = bundle.add(paymentRecord)
            OptumLoggerUtil.logDebugLevel("Removing Payment Record : PaymentRecord PublicID : ${paymentRecord.PublicID} Created Time ${paymentRecord.CreateTime}","doWork()")
            paymentRecord.remove()
            OptumLoggerUtil.logDebugLevel("Removed Payment Record SuccessFully: PaymentRecord PublicID : ${paymentRecord.PublicID} Created Time ${paymentRecord.CreateTime}","doWork()")
            this.incrementOperationsCompleted()
          })
        }, User.util.UnrestrictedUser)//todo running from UI right will the user is required.?
        OptumLoggerUtil.logDebugLevel("OptumRecordsPurgeBatchProcess: No of records Purged: ${this.OperationsCompleted}","doWork()")
      }
      OptumLoggerUtil.logDebugLevel("After Purging Payment Records Count ${paymentRecords.Count}","doWork()")
    } catch (e : Exception) {
      this.incrementOperationsFailed()
      OptumLoggerUtil.logErrorLevel("OptumRecordsPurgeBatchProcess Failed to execute ${e.StackTraceAsString}", "doWork()", :ex = e)
      throw e
    } finally {
      OptumLoggerUtil.logDebugLevel("OptumRecordsPurgeBatchProcess: finishing batch job", "doWork()")
    }
  }

  /**
   * Method evaluates eligible records since past one year to remove payment records
   *
   * @return IQueryBeanResult<OptumPaymentRecord_Acc>
   */
  function getEligiblePaymentRecords() : IQueryBeanResult<OptumPaymentRecord_Acc> {
    var numberOfDaysPerPurge = OptumRuntimeProperties.NoOfDaysForOptumPurgeRecords?.toInt()
    var paymentRecords = Query.make(entity.OptumPaymentRecord_Acc).compare(OptumPaymentRecord_Acc#CreateTime, Relop.LessThan, DateUtil.currentDate().addDays(numberOfDaysPerPurge)).select()
    return paymentRecords
  }
}