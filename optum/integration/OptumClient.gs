package acc.optum.integration

uses acc.optum.OptumConstants
uses acc.optum.exception.OptumException
uses acc.optum.logger.OptumLoggerUtil
uses acc.optum.runtimeproperties.OptumRuntimeProperties
uses acc.optum.util.OptumPaymentUtil
uses gw.api.database.Query
uses gw.api.database.Relop
uses gw.api.json.JsonParseException
uses gw.api.locale.DisplayKey
uses gw.api.util.DisplayableException
uses gw.plugin.credentials.CredentialsUtil
uses jsonschema.acc.optum.document_details.v1_0.DocumentDetails
uses jsonschema.acc.optum.send_enrollment_details.v1_0.EnrolmentDetails
uses jsonschema.acc.optum.transactionid_response.v1_0.TransactionIdResponse
uses okhttp3.HttpUrl
uses okhttp3.MediaType
uses okhttp3.OkHttpClient
uses okhttp3.Request
uses okhttp3.RequestBody
uses okhttp3.Response
uses org.apache.http.HttpHeaders
uses wsi.local.gw.wsi.pl.systemtoolsapi.faults.RequiredFieldException

uses java.io.InputStream
uses java.net.ConnectException
uses java.net.SocketTimeoutException
uses java.util.concurrent.TimeoutException


/**
 * Client class used to consume Optum REST API
 */
class OptumClient {
  private static var _serviceRequestHTTPClient = new OkHttpClient()

  /**
   * Method send Enrollment Details to Optum system by consuming Optum API
   *
   * @param enrollmentPayload
   * @return int
   */
  public static function sendEnrollmentDetails(enrollmentPayload : String) : int {
    var response : Response = null
    var responseCode : int
    var errorMessage : String = null
    try {
      OptumLoggerUtil.logDebugLevel("Sending Enrollment details to Optum with enrollmentPayload ${enrollmentPayload}", "sendEnrollmentDetails()")//todo remove this enrollmentPayload while delivering the package
      var request = getServiceRequest(enrollmentPayload, OptumRuntimeProperties.OptumSendEnrolmentURL).build()
      response = _serviceRequestHTTPClient.newCall(request).execute()
      responseCode = response.code()
      if (OptumConstants.CLIENT_ERROR.contains(responseCode)) {
        throw new OptumException("Client error occured with error code : ${responseCode}, error : ${response.body().string()}")
      } else if (OptumConstants.SERVER_ERROR.contains(responseCode)) {
        throw new OptumException("Server error occured with error code : ${responseCode}, error : ${responseCode}, error : ${response.body().string()}")
      } else if (OptumConstants.SUCCESS_CODE.contains(responseCode)) {
        OptumLoggerUtil.logDebugLevel("ResponseCode : ${responseCode}", "sendEnrollmentDetails()")
      } else {
        errorMessage = "Unknown exception occured while making service call to Optum with response code : ${responseCode}, error : ${response.body().string()}"
        throw new OptumException(errorMessage)
      }
    } catch (e : TimeoutException) {
      errorMessage = "Timeout exception occurred, this message can be retried: ${e.Message}"
      OptumLoggerUtil.logErrorLevel(errorMessage, "sendEnrollmentDetails()", :ex = e)
      throw e
    } catch (e : SocketTimeoutException) {
      errorMessage = "Socket Timeout exception occurred, this message can be retried: ${e.Message}"
      OptumLoggerUtil.logErrorLevel(errorMessage, "sendEnrollmentDetails()", :ex = e)
      throw e
    } catch (ne : ConnectException) {
      errorMessage = "Network exception occured , this message can be retried: ${ne.Message}"
      OptumLoggerUtil.logErrorLevel(errorMessage, "sendEnrollmentDetails()", :ex = ne)
      throw ne
    } catch (ex : OptumException) {
      OptumLoggerUtil.logErrorLevel(ex.Message, "sendEnrollmentDetails()", :ex = ex)
      throw ex
    } catch (e : Exception) {
      OptumLoggerUtil.logErrorLevel(e.Message, "sendEnrollmentDetails()", :ex = e)
      throw e
    } finally {
      if (not(response == null)) {
        response.close()
        OptumLoggerUtil.logInfoLevel("connection closed", "sendEnrollmentDetails()")
      }
    }
    return responseCode
  }

  /**
   * method used to generate the Optum Enrollment payload
   *
   * @param claimContact
   * @return
   */
  public static function generateEnrollmentPayload(claimContact : ClaimContact) : String {
    var enrolmentDetails : EnrolmentDetails
    if (claimContact.Contact typeis Person) {
      enrolmentDetails = new EnrolmentDetails()
      var person = claimContact.Contact
      enrolmentDetails.memberId = claimContact.PublicID
      enrolmentDetails.fundingAccountCode = OptumRuntimeProperties.FundingAccountCode
      enrolmentDetails.payeeName = person.DisplayName
      enrolmentDetails.payeeEmail = person.EmailAddress1
      enrolmentDetails.policyNumber = claimContact.Claim.Policy.PolicyNumber
      enrolmentDetails.cellPhoneNumber = person.CellPhone
      return enrolmentDetails?.unwrap()?.toJsonString()
    }
    return OptumConstants.EMPTY_STRING
  }

  /**
   * Method to Send Enrollment Details to Optum System when User click on SendEnrollment Button
   *
   * @param claimContact
   */
  public static function enrollToOptum(claimContact : ClaimContact) {
    try {
      gw.transaction.Transaction.runWithNewBundle(\bundle -> {
        claimContact = bundle.add(claimContact)
        var enrollmentPayload = generateEnrollmentPayload(claimContact)
        if (enrollmentPayload.HasContent) {
          var responseCode = sendEnrollmentDetails(enrollmentPayload)
          if (OptumConstants.SUCCESS_CODE.contains(responseCode)) {
            claimContact.OptumEnrollmentStatus_Acc = OptumEnrollmentStatus_Acc.TC_REQUESTED
            OptumLoggerUtil.logDebugLevel("Enrollment Status Updated as ${claimContact.OptumEnrollmentStatus_Acc} for PayeeID :${claimContact.PublicID} for Claim ${claimContact.Claim.ClaimNumber}"
                , "enrollToOptum")//todo remove publicid while delivering the package
          }
          if (responseCode == 409 and claimContact.OptumEnrollmentStatus_Acc == OptumEnrollmentStatus_Acc.TC_REQUESTED) {
            claimContact.OptumEnrollmentStatus_Acc = OptumEnrollmentStatus_Acc.TC_REQUESTED
            OptumLoggerUtil.logDebugLevel("Enrollment Status Updated as ${claimContact.OptumEnrollmentStatus_Acc} for PayeeID :${claimContact.PublicID} for Claim ${claimContact.Claim.ClaimNumber}"
                , "enrollToOptum")//todo remove publicid while delivering the package
          }
        }
      })
    } catch (ex : OptumException) {
      claimContact.OptumEnrollmentStatus_Acc = OptumEnrollmentStatus_Acc.TC_ERROR
      OptumLoggerUtil.logDebugLevel("Enrollment Status Updated as ${claimContact.OptumEnrollmentStatus_Acc} for PayeeID :${claimContact.PublicID} for Claim", "enrollToOptum")//todo remove public id while package delivery
    } catch (ex : Exception) {
      claimContact.OptumEnrollmentStatus_Acc = OptumEnrollmentStatus_Acc.TC_ERROR
      OptumLoggerUtil.logDebugLevel("Enrollment Status Updated as ${claimContact.OptumEnrollmentStatus_Acc} for PayeeID :${claimContact.PublicID} for Claim", "enrollToOptum")//todo remove public id while package delivery
    }
  }

  /**
   * Method to retrieve ,Download Document content from Optum System
   *
   * @param documentDetails
   * @param claim
   */
  public static function downloadDocuments(documentDetails : List<DocumentDetails>, claim : Claim) {//todo check this method code multiple if blocks are there
    var response : Response = null
    var entity : InputStream = null
    var errorMessage : String = null
    try {
      documentDetails?.each(\documentDetail -> {
        var header : String = null
        if (documentDetail.DocumentID.HasContent and documentDetail.TransactionID.HasContent) {
          var existingDocument = Query.make(Document).compare(Document#DocumentIdentifier, Relop.Equals, documentDetail.DocumentID).join(Document#Claim).compare(Claim#ClaimNumber, Relop.Equals, claim.ClaimNumber).select().AtMostOneRow
          if (existingDocument == null) {
            switch (documentDetail.DocumentType) {
              case OptumConstants.TEXT:
                header = OptumConstants.CONTENT_TYPETEXT
                break
              case OptumConstants.PDF:
                header = OptumConstants.CONTENT_TYPEPDF
                break
              default:
                throw new IllegalArgumentException(DisplayKey.get("Accelerator.Optum.InvalidType", documentDetail.DocumentType))
            }
            var documentURL = "${OptumRuntimeProperties.DownloadDocumentURL}${OptumConstants.SLASH}${documentDetail.TransactionID}${OptumConstants.SLASH}${documentDetail.DocumentID}${OptumConstants.SLASHDOWNLOAD}"
            var request = getServiceRequest(null, documentURL).addHeader(OptumConstants.CONTENT_TYPE, header)
            response = _serviceRequestHTTPClient.newCall(request.build()).execute()
            entity = response?.body()?.byteStream()
            if (entity == null) {
              throw new OptumException("No content exist for DocumentID: ${documentDetail.DocumentID}")//todo remove document id from loggers
            }
            OptumPaymentUtil.createDocument(documentDetail, claim, entity)
          } else {
            //If the document is exist move on to next document in list
            OptumLoggerUtil.logDebugLevel("Document already exists for DocumentID: ${documentDetail.DocumentID}", "downloadDocuments()")//todo remove document id in package delivery
          }
        } else {
          var reqMessage : String
          if (not documentDetail.DocumentID.HasContent and not documentDetail.TransactionID.HasContent) {
            reqMessage = DisplayKey.get("Accelerator.Optum.Field.TransactionIDAndDocumentID")
          } else if (not documentDetail.DocumentID.HasContent) {
            reqMessage = DisplayKey.get("Accelerator.Optum.Field.DocumentID")
          } else if (not documentDetail.TransactionID.HasContent) {
            reqMessage = DisplayKey.get("Accelerator.Optum.Field.TransactionID")
          }
          throw new RequiredFieldException("${reqMessage} is Required")
        }
      })
    } catch (ex : TimeoutException) {
      errorMessage = "Timeout exception error message : ${ex.Message}"
      OptumLoggerUtil.logErrorLevel(errorMessage, "getServiceRequest(String,String)", :ex = ex)
      throw ex
    } catch (e : SocketTimeoutException) {
      errorMessage = "Socket Timeout exception error message : ${e.Message}"
      OptumLoggerUtil.logErrorLevel(e.Message, "getServiceRequest()", :ex = e)
      throw e
    } catch (ne : ConnectException) {
      errorMessage = "Network exception occurred, this message can be retried: ${ne.Message}"
      OptumLoggerUtil.logErrorLevel(errorMessage, "getServiceRequest(String,String)", :ex = ne)
      throw ne
    } catch (e : OptumException) {
      OptumLoggerUtil.logErrorLevel(e.StackTraceAsString, "downloadDocuments()", :ex = e)
      throw e
    } catch (e : Exception) {
      OptumLoggerUtil.logErrorLevel(e.StackTraceAsString, "downloadDocuments()", :ex = e)
      throw e
    } finally {
      entity?.close()
      response?.close()
    }
  }

  /**
   * Method used for Service Request
   *
   * @param payload
   * @param url
   * @return
   */
  private static function getServiceRequest(payload : String, url : String) : Request.Builder {
    var builder = new Request.Builder()
    try {
      OptumLoggerUtil.logInfoLevel("Creating request body", "getServiceRequest(String,String)")
      builder = builder.url(url)
      if (payload.HasContent) {
        var requestBody = RequestBody.create(MediaType.parse(OptumConstants.APPLICATION_JSON), payload)
        builder = builder.post(requestBody)
      } else {
        builder = builder.get()
      }
      var optumCredentials = CredentialsUtil.getCredentialsFromPlugin(OptumConstants.OPTUM_API_CRED)
      builder = builder.addHeader(HttpHeaders.CONTENT_TYPE, OptumConstants.APPLICATION_JSON)
          .addHeader(HttpHeaders.CONTENT_TYPE, OptumConstants.CONTENT_TYPE)
          .addHeader(OptumConstants.ClIENTID_HEADER, optumCredentials.Username)
          .addHeader(OptumConstants.SECRECT_HEADER, optumCredentials.Password)
          .addHeader(OptumConstants.HOST, OptumRuntimeProperties.OptumHost)
          .addHeader(OptumConstants.STRICT_TRANSPORT_SECURITY, OptumConstants.MAX_AGE_INCLUDE_SUB_DOMAINS)
          .addHeader(OptumConstants.CACHE_CONTROL, OptumConstants.NO_STORE_MAX_AGE)
          .addHeader(OptumConstants.CONTENT_SECURITY_POLICY, OptumConstants.SELF)
    } catch (ex : Exception) {
      OptumLoggerUtil.logErrorLevel(ex.Message, "getServiceRequest(String,String)", :ex = ex)
      throw ex
    }
    return builder
  }

  /**
   * Method used for void or stop the check
   *
   * @param payload
   * @return int
   */
  public static function voidOrStopCheck(check : Check, status : TransactionStatus, currentLocation : pcf.api.Location) {
    try {
      gw.api.util.CCLocationUtil.runAndCommit(\-> updateStatusAndCancelPayment(check, status), currentLocation)
    } catch (de : DisplayableException) {
      OptumLoggerUtil.logErrorLevel(de.Message, "voidOrStopCheck()", :ex = de)
      throw de
    } catch (e : IllegalStateException) {
      var exception = new DisplayableException(DisplayKey.get("Web.Financials.CheckCancel.Error.IllegalFinancialsStatus"), e)
      OptumLoggerUtil.logErrorLevel(exception.Message, "voidOrStop()", :ex = e)
      throw exception
    } catch (e : Exception) {
      OptumLoggerUtil.logErrorLevel(e.Message, "voidOrStopCheck()", :ex = e)
      throw new DisplayableException(e.Message)
    }
  }

  private static function updateStatusAndCancelPayment(check : Check, status : TransactionStatus) {
    var errorMessage : String = null
    var httpResponse : Response = null
    try {
      if (status == TransactionStatus.TC_VOIDED) {
        check.voidCheck()
      } else {
        check.stopCheck()
      }
      if (check.PaymentMethod == PaymentMethod.TC_OPTUM_ACC) {
        var optumPaymentRecord = Query.make(OptumPaymentRecord_Acc).compare(OptumPaymentRecord_Acc#CheckPublicID, Relop.Equals, check.PublicID).select().AtMostOneRow
        if(optumPaymentRecord == null){
          throw new OptumException("Check not yet send from ClaimCenter to Optum, please wait and try again after some time..")
        }
        OptumLoggerUtil.logDebugLevel("Sending a request to void or stop a check", "updateStatusAndCancelPayment()")
        //creating transaction id url builder
        var urlBuilder = HttpUrl.parse(OptumRuntimeProperties.OptumTransactionIdUrl).newBuilder()
        //creating path parameters
        urlBuilder.addPathSegment(OptumRuntimeProperties.OptumClientCode)
        urlBuilder.addPathSegment(OptumRuntimeProperties.OptumBillingEntityCode)
        //urlBuilder.addPathSegment(optumPaymentRecord.PaymentID)
        urlBuilder.addPathSegment(OptumRuntimeProperties.OptumPaymentID)//todo temp passing payment ids from runtime properties remove this line and uncomment above line while package delivery
        var transactionIdUrl = urlBuilder.build()?.toString()
        var httpRequest = getServiceRequest(null, transactionIdUrl)?.build()
        httpResponse = _serviceRequestHTTPClient.newCall(httpRequest).execute()
        var responseCode = httpResponse.code()
        switch (responseCode) {
          case 200:
            var responseBody = httpResponse?.body()?.toString()
            var transactionIdResponse = TransactionIdResponse.parse(responseBody)
            OptumClient.stopPayment(transactionIdResponse, check)
            break
          case 400:
            var exception = new OptumException("Validation errors in the request, please check the logs for more details..")
            OptumLoggerUtil.logErrorLevel("Validation errors ${httpResponse?.body()?.toString()}", "updateStatusAndCancelPayment()", :ex = exception)
            throw exception
          case 404:
            var exception = new OptumException("Payment not yet received in the Optum system, please wait for some time and try again..")
            OptumLoggerUtil.logErrorLevel(exception.Message, "updateStatusAndCancelPayment()", :ex = exception)
            throw exception
          default:
            var exception = new OptumException("Unknown exception arised, please check the logs for more information..")
            OptumLoggerUtil.logErrorLevel(httpResponse?.body()?.toString(), "updateStatusAndCancelPayment()", :ex = exception)
            throw exception
        }
      }
    } catch (e : SocketTimeoutException) {
      errorMessage = "Socket Timeout exception occurred, unable to connect Optum system to cancel payment: ${e.Message}"
      OptumLoggerUtil.logErrorLevel(errorMessage, "updateStatusAndCancelPayment()", :ex = e)
      throw new DisplayableException(errorMessage)
    } catch (ne : ConnectException) {
      errorMessage = "Network exception occured, unable to connect Optum system to cancel payment: ${ne.Message}"
      OptumLoggerUtil.logErrorLevel(errorMessage, "updateStatusAndCancelPayment()", :ex = ne)
      throw new DisplayableException(errorMessage)
    } catch (exception : JsonParseException) {
      errorMessage = "Exception occurred while processing the response, please check the logs for more details.."
      OptumLoggerUtil.logErrorLevel(exception.Message, "updateStatusAndCancelPayment()", :ex = exception)
      throw new DisplayableException(errorMessage)
    } catch (ex : OptumException) {
      OptumLoggerUtil.logErrorLevel(ex.Message, "updateStatusAndCancelPayment()", :ex = ex)
      throw new DisplayableException(ex.Message)
    } catch (e : IllegalStateException) {
      OptumLoggerUtil.logErrorLevel(e.Message, "updateStatusAndCancelPayment()", :ex = e)
      throw e
    } catch (e : Exception) {
      OptumLoggerUtil.logErrorLevel(e.Message, "updateStatusAndCancelPayment()", :ex = e)
      throw new DisplayableException(e.Message)
    } finally {
      httpResponse?.close()
    }
  }

  private static function stopPayment(transactionIdResponse : TransactionIdResponse, check : Check) {
    var httpResponse : Response = null
    try {
      //creating a url builder
      var urlBuilder = HttpUrl.parse(OptumRuntimeProperties.OptumCancellationUrl).newBuilder()
      //Adding query parameters
      urlBuilder.addQueryParameter(OptumConstants.OPTUM_TRANSACITONID, transactionIdResponse.transactionId)
      //Building url and converting it to string
      var cancellationUrl = urlBuilder.build().toString()
      var httpRequestBuilder = getServiceRequest(null, cancellationUrl)
      //Making request with delete operation
      httpRequestBuilder = httpRequestBuilder.delete()
      var httpRequest = httpRequestBuilder.build()
      //Making API call to void the transaction
      httpResponse = _serviceRequestHTTPClient.newCall(httpRequest).execute()
      var responseCode = httpResponse.code()
      switch (responseCode) {
        case 200:
          OptumLoggerUtil.logInfoLevel("Check has been stop/void successfully", "stopPayment()")
          var historyDescription = DisplayKey.get("Accelerator.Optum.CheckStatusUpdate", check.getOriginalValue(Check#Status), check.Status, check.GrossAmount)
          OptumPaymentUtil.createHistory(check.Claim, HistoryType.TC_PAYMENTTYPE_ACC, historyDescription)
          break
        case 400:
          var exception = new OptumException("Bad request: ${httpResponse?.body()?.toString()}")
          OptumLoggerUtil.logErrorLevel("Unable to perform cancellation due to validation errors in the request, please check in the logs for more information ", "stopPayment()", :ex = exception)
          throw exception
        case 404:
          var exception = new OptumException("Payment not yet received in the Optum system, please wait for some time and try again...")
          OptumLoggerUtil.logErrorLevel(exception.Message, "stopPayment()", :ex = exception)
          throw exception
        default:
          var exception = new OptumException("Unknown exception arised, please check the logs for more information")
          OptumLoggerUtil.logErrorLevel("Unknown exception occurred while making payment cancellation API call: ${httpResponse.body().toString()}", "stopPayment()", exception)
          throw exception
      }
    } catch (e : SocketTimeoutException) {
      OptumLoggerUtil.logErrorLevel(e.Message, "voidOrStopCheck()", :ex = e)
      throw e
    } catch (ne : ConnectException) {
      OptumLoggerUtil.logErrorLevel(ne.Message, "voidOrStopCheck()", :ex = ne)
      throw ne
    } catch (ex : OptumException) {
      OptumLoggerUtil.logErrorLevel(ex.Message, "voidOrStopCheck()", :ex = ex)
      throw ex
    } catch (e : Exception) {
      OptumLoggerUtil.logErrorLevel(e.Message, "voidOrStopCheck()", :ex = e)
      throw e
    } finally {
      if (not(httpResponse == null)) {
        httpResponse.close()
        OptumLoggerUtil.logInfoLevel("Cancellation connection closed", "voidOrStopCheck()")
      }
    }
  }
}
