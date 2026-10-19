@extends('admin')
@section('title', 'WA Message')
@section('content')
  <div class="page-content">
    <div class="page-content browse container-fluid">
      <div class="row">
        <div class="col-md-12">
          <div class="card card-bordered">
            <div class="card-header">
              <h4 class="page-title">
                <i class="fas fa-fw fa-chart-line "></i> WA Message
              </h4>
            </div>

            <div class="card-body">
              {{-- Filter --}}
              <div class="form form-horizontal well" id="col-filter-datatables" aria-expanded="true" style="">
                <div class="row">
                  <div class="col-md-6">
                    <div class="form-group row">
                      <label class="col-md-3 control-label control-label">Keyword</label>
                      <div class="col-md-9">
                        <input id="searchKeyword" type="text" class="form-control">
                      </div>
                    </div>
                    <div class="form-group row">
                      <label class="col-md-3 control-label">Group Store</label>
                      <div class="col-md-9">
                        <select style="width: 100%;" class="form-control select2" id="searchGroup" tabindex="-1"
                          aria-hidden="true">
                          <option value="">Semua Group</option>
                          @foreach ($groups as $v)
                            <option value="{{ $v->id }}">{{ $v->name }}</option>
                          @endforeach
                        </select>
                      </div>
                    </div>
                    <div class="form-group row">
                      <label for="searchServerStatus" class="col-md-3 control-label">Status di Server</label>
                      <div class="col-md-9">
                        <select style="width: 100%;" class="form-control" id="searchServerStatus">
                          <option value="">Semua</option>
                          <option value="REQUESTING">REQUESTING</option>
                          <option value="UNKNOWN">UNKNOWN</option>
                          <option value="ACCEPTED">ACCEPTED</option>
                          <option value="QUEUED">QUEUED</option>
                          <option value="PROCESSING">PROCESSING</option>
                          <option value="SENDING">SENDING</option>
                          <option value="SENT">SENT</option>
                          <option value="DELIVERED">DELIVERED</option>
                          <option value="READ">READ</option>
                          <option value="FAILED">FAILED</option>
                          <option value="UNCERTAIN">UNCERTAIN</option>
                          <option value="REVIEW">REVIEW</option>
                          <option value="INVALID">INVALID</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div class="col-md-6" style="margin-bottom: 0;">
                    <div class="form-group row">
                      <label class="col-md-3 control-label">Tgl Insert</label>
                      <div class="col-md-9">
                        <div class="row">
                          <div class="col-md-6" style="margin-bottom: 0">
                            <input required="" class="form-control datepicker" id="searchTglawal"
                              value="{{ date('d/m/Y') }}">
                          </div>
                          <div class="col-md-6" style="margin-bottom: 0">
                            <input required="" class="form-control datepicker" id="searchTglakhir"
                              value="{{ date('d/m/Y') }}">
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="form-group row">
                      <label class="col-md-3 control-label">Status WA</label>
                      <div class="col-md-9">
                        <select style="width: 100%;" class="form-control" id="searchStatus" tabindex="-1"
                          aria-hidden="true">
                          <option value="2">Failed</option>
                          <option value="1">Success</option>
                          <option selected value="0">On Queue</option>
                          <option value="">Semua</option>
                        </select>
                      </div>
                    </div>
                    <div class="form-group row">
                      <div class="offset-md-3 col-md-9">
                        <button id="cariDatatable" class="btn btn-success btn-block"><i class="fa fa-search"></i>
                          Cari</button>
                      </div>
                    </div>
                  </div>
                  <div class="clearfix"></div>
                  <!-- pencarian -->
                </div>
              </div>

              <div class="table-responsive">
                <table id="dataTable" class="table table-hover">
                  <thead>
                    <tr>
                      <!-- <th>Action</th> -->
                      <th>Store</th>
                      <th>Invoice</th>
                      <th>Status</th>
                      <th>Status Server</th>
                      <th>Keterangan</th>
                      <th>Send To</th>
                      <th>ID</th>
                      <th>ID Pengiriman / Request</th>
                      <th>CC</th>
                      <th>Engine</th>
                      <th>Tanggal Insert</th>
                      <th>Tanggal Update</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
@stop

@section('css')
  <style>
    .mb-0 {
      margin-bottom: 0;
    }
  </style>
@stop

@section('js')
  <script>
    $(document).ready(function() {
      $('#selectBarangOffline').select2({
        width: '100%',
      })

      $("#searchKeyword").on('keyup', function(e) {
        if (e.keyCode == 13) {
          $("#cariDatatable").click();
        }
      });

      var table = $('#dataTable').DataTable({
        processing: true,
        serverSide: true,
        scrollY: 400,
        order: [
          [10, 'desc']
        ],
        pageLength: 100,
        searching: false,
        ajax: {
          url: "{{ route('admin.waMessageHistory.datatables') }}",
          "data": function(d) {
            return $.extend({}, d, {
              'keyword': $('#searchKeyword').val(),
              'status': $('#searchStatus').val(),
              'server_status': $('#searchServerStatus').val(),
              'group': $('#searchGroup').val(),
              'tglAwal': $('#searchTglawal').val(),
              'tglAkhir': $('#searchTglakhir').val(),
            });
          }
        },

        columnDefs: [
          {
            targets: [1],
            searchable: false,
            sortable: false
          },
        ],

        language: {
          "info": "Showing _START_ to _END_ of _TOTAL_ entries",
          "infoEmpty": "Showing 0 to 0 of 0 entries",
          "infoFiltered": "",
        },
        columns: [
          // {
          //   data: 'id_bs',
          //   name: 'id'
          // },
          {
            data: 'sender_name',
            name: 'sender_name'
          },
          {
            data: 'orderId',
            name: 'orderId'
          },
          {
            data: 'status_label',
            name: 'status_label'
          },
          {
            data: 'server_status',
            name: 'xx_send_message.xx_jeblast_state',
            defaultContent: '-',
            render: $.fn.dataTable.render.text()
          },
          {
            data: 'status_message',
            name: 'status_message',
            render: $.fn.dataTable.render.text()
          },
          {
            data: 'to',
            name: 'to'
          },
          {
            data: 'id',
            name: 'xx_send_message.id'
          },
          {
            data: 'job_id',
            name: 'xx_send_message.xx_jeblast_job_id',
            defaultContent: '',
            render: function(data, type, row) {
              if (type !== 'display' || !data) return data || '';
              var rejected = /(?:token|api[ _-]?key)\s+(?:perangkat\s+)?(?:tidak valid|invalid)/i.test(row.status_message || '');
              return $.fn.dataTable.render.text().display(data)
                + (rejected ? '<br><small class="text-muted">ID request; ditolak sebelum tersimpan</small>' : '');
            }
          },
          {
            data: 'is_cc',
            name: 'is_cc',
            orderable: false,
            render: function(data, type, row) {
              if (data) {
                return '<span class="badge badge-success">Ya</span>';
              } else {
                return '<span class="badge badge-danger">Tidak</span>';
              }
            }
          },
          {
            data: 'vendor_label',
            name: 'vendor_label'
          },
          {
            data: 'created_at',
            name: 'created_at'
          },
          {
            data: 'updated_at',
            name: 'updated_at'
          },
          {
            data: null,
            orderable: false,
            searchable: false,
            render: function(data, type, row) {
              if (type !== 'display') {
                return '';
              }
              if (!row.job_id) {
                return '<span class="text-muted">Belum ada Job ID</span>';
              }
              return '<button type="button" class="btn btn-info btn-sm cek-status-server">Cek &amp; Update Status</button>';
            }
          },
        ],
        drawCallback: function() {
          $("div.toolbar").html(
            '<div class="row"><div class="col-md-12 text-right" role="group" style="margin-bottom:0;"><button type="button" id="kirim-ulang" class="btn btn-info" style="margin-right: 5px;">Kirim Ulang</button></div></div>'
          );
        }
      })

      $('body').on('click', '#cariDatatable', function(e) {
        e.preventDefault();
        table.ajax.reload(false)
      })

      $('#dataTable').on('click', '.cek-status-server', function() {
        var button = $(this);
        var row = table.row(button.closest('tr')).data();
        button.prop('disabled', true).text('Mengecek...');
        $.ajax({
          url: "{{ route('admin.waMessageHistory.checkServerStatus') }}",
          type: 'POST',
          dataType: 'json',
          data: {
            _token: '{{ csrf_token() }}',
            id: row.id
          },
          success: function(data) {
            table.ajax.reload(null, false);
            toastr.success(data.message, 'Status di Server', { escapeHtml: true });
          },
          error: function(xhr) {
            var response = xhr.responseJSON || {};
            var errors = response.errors || {};
            toastr.error(errors.id ? errors.id[0] : (response.message || 'Gagal mengecek status di server.'), 'Status di Server', { escapeHtml: true });
          },
          complete: function() {
            button.prop('disabled', false).text('Cek & Update Status');
          }
        });
      });

      $('body').on('click', '#kirim-ulang', function() {
        if (typeof table.ajax.params() === "undefined") {
          alert('Klik Cari terlebih dahulu.');
        } else {
          $.ajax({
            url: "{{ route('admin.waMessageHistory.resend') }}",
            data: table.ajax.params(),
            dataType: "json",
            success: function(data) {
              $("#cariDatatable").click();
              alert(data.message);
            }
          })
        }
      });
    })
  </script>
@stop
